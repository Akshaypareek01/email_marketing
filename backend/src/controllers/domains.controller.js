import { Domain } from '../models/Domain.js';
import { Tenant } from '../models/Tenant.js';
import { assertCanAddDomain } from '../services/planLimits.service.js';
import { resolveSesIdentity, getSesIdentityStatus, configureSesMailFrom } from '../services/ses.service.js';
import {
  generateDnsRecords,
  verifyDomainDnsRecords,
  computeVerifiedForSending,
  syncDomainDnsRecords,
  syncBimiDnsRecord,
} from '../services/domainDns.service.js';
import {
  updateDomainBranding,
  createBrandLogoUploadUrl,
  confirmBrandLogoUpload,
} from '../services/domainBranding.service.js';
import logger from '../middleware/logsCreate.js';

export async function listDomains(req, res, next) {
  try {
    const domains = await Domain.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 });
    res.json({ domains });
  } catch (err) {
    next(err);
  }
}

export async function getDomain(req, res, next) {
  try {
    const domain = await Domain.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!domain) return res.status(404).json({ message: 'Domain not found' });
    res.json({ domain });
  } catch (err) {
    next(err);
  }
}

export async function createDomain(req, res, next) {
  try {
    const name = req.body.name.toLowerCase().trim();

    // Enforce trial window + plan domain allowance before doing any SES work.
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Account not found' });
    const domainCount = await Domain.countDocuments({ tenantId: req.user.tenantId });
    assertCanAddDomain(tenant, domainCount);

    const existing = await Domain.findOne({ name });
    if (existing) {
      // Generic message — don't disclose to one tenant that another already owns this domain.
      const sameTenant = String(existing.tenantId) === String(req.user.tenantId);
      return res.status(409).json({
        message: sameTenant
          ? 'You have already added this domain.'
          : 'This domain cannot be added. Verify you own it or contact support.',
      });
    }

    const ses = await resolveSesIdentity(name);
    const dnsRecords = generateDnsRecords(name, ses.dkimTokens);

    for (const record of dnsRecords) {
      if (record.purpose === 'dkim') {
        record.verified = ses.dkimStatus === 'SUCCESS';
      }
    }

    const domain = await Domain.create({
      tenantId: req.user.tenantId,
      name,
      status: 'pending',
      sesIdentityArn: ses.identityArn,
      verifiedForSending: false,
      dkimStatus: ses.dkimStatus,
      dnsRecords,
      lastCheckedAt: new Date(),
    });

    logger.info({
      url: req.originalUrl,
      method: req.method,
      payload: req.body,
      response: domain,
      sesResponse: ses,
    });
    res.status(201).json({ domain });
  } catch (err) {
    next(err);
  }
}

/**
 * Re-check SES + live DNS records; gate sending on DMARC + MAIL FROM + DKIM.
 */
export async function verifyDomain(req, res, next) {
  try {
    const domain = await Domain.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });

    if (!domain) {
      return res.status(404).json({ message: 'Domain not found' });
    }

    domain.status = 'verifying';
    domain.lastCheckedAt = new Date();
    domain.failureReason = '';

    const sesStatus = await getSesIdentityStatus(domain.name);
    domain.dkimStatus = sesStatus.dkimStatus;

    syncDomainDnsRecords(domain, sesStatus.dkimTokens || []);
    syncBimiDnsRecord(domain);

    const mailFromDomain = `mail.${domain.name}`;
    try {
      await configureSesMailFrom(domain.name, mailFromDomain);
    } catch (err) {
      logger.warn({ tag: 'ses-mail-from', domain: domain.name, error: err.message });
    }

    await verifyDomainDnsRecords(domain);

    for (const record of domain.dnsRecords) {
      if (record.purpose === 'dkim') {
        record.verified = record.verified || sesStatus.dkimStatus === 'SUCCESS';
      }
    }

    domain.verifiedForSending = computeVerifiedForSending(domain, sesStatus);
    domain.status = domain.verifiedForSending ? 'active' : 'pending';

    if (!domain.verifiedForSending) {
      const missing = domain.dnsRecords.filter((r) => !r.verified).map((r) => r.purpose);
      domain.failureReason = `Missing or unverified DNS: ${[...new Set(missing)].join(', ')}`;
    }

    await domain.save();

    logger.info({
      url: req.originalUrl,
      method: req.method,
      response: domain,
      sesResponse: sesStatus,
    });

    res.json({ domain, sesStatus });
  } catch (err) {
    next(err);
  }
}

export async function deleteDomain(req, res, next) {
  try {
    const domain = await Domain.findOneAndDelete({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!domain) return res.status(404).json({ message: 'Domain not found' });
    res.json({ message: 'Domain removed' });
  } catch (err) {
    next(err);
  }
}

/**
 * Update sender display name and/or logo URL for a domain.
 */
export async function patchDomainBranding(req, res, next) {
  try {
    const domain = await updateDomainBranding(req.user.tenantId, req.params.id, req.body);
    res.json({ domain });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Presigned URL to upload a brand logo (PNG/JPEG/SVG).
 */
export async function brandLogoUploadUrl(req, res, next) {
  try {
    const { mimeType } = req.body;
    if (!mimeType) return res.status(400).json({ message: 'mimeType is required' });
    const out = await createBrandLogoUploadUrl(req.user.tenantId, req.params.id, mimeType);
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Confirm brand logo upload and attach public URL + BIMI DNS row.
 */
export async function confirmBrandLogo(req, res, next) {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ message: 'key is required' });
    const result = await confirmBrandLogoUpload(req.user.tenantId, req.params.id, key);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
