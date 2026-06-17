import { Tenant } from '../models/Tenant.js';
import { KycDocument } from '../models/KycDocument.js';
import { presignView } from '../services/r2.service.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';
import { upsertSystemNotice, deactivateSystemNotice } from '../services/systemNotice.service.js';

/** Super-admin: list tenants by KYC status (default: awaiting review). */
export async function listKycQueue(req, res, next) {
  try {
    const status = req.query.status || 'submitted';
    const tenants = await Tenant.find({ 'kyc.status': status })
      .select('name slug kyc createdAt')
      .sort({ 'kyc.submittedAt': 1 })
      .lean();
    res.json({ tenants });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: KYC detail for one tenant with its uploaded documents. */
export async function getKycDetail(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.params.id).select('name slug kyc').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const documents = await KycDocument.find({ tenantId: req.params.id, status: 'uploaded' })
      .select('docType originalName mimeType sizeBytes uploadedAt')
      .lean();
    res.json({ tenant, documents });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: short-TTL presigned URL to view one document. Audited. */
export async function viewKycDocument(req, res, next) {
  try {
    const doc = await KycDocument.findOne({ _id: req.params.docId, tenantId: req.params.id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const url = await presignView(doc.storageKey);
    await writeAuditLog({
      ...auditContext(req),
      action: 'kyc.document.viewed',
      targetType: 'tenant',
      targetId: req.params.id,
      metadata: { docType: doc.docType },
    });
    res.json({ url, expiresIn: 120 });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: approve or reject a submitted KYC. */
export async function decideKyc(req, res, next) {
  try {
    const { decision, reason = '' } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be approved or rejected' });
    }
    if (decision === 'rejected' && !String(reason).trim()) {
      return res.status(400).json({ message: 'reason is required when rejecting' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (tenant.kyc.status !== 'submitted') {
      return res.status(409).json({ message: `KYC is ${tenant.kyc.status}, not awaiting review` });
    }

    tenant.kyc.status = decision;
    tenant.kyc.reviewedAt = new Date();
    tenant.kyc.reviewedBy = req.user._id;
    tenant.kyc.rejectionReason = decision === 'rejected' ? String(reason).trim() : '';
    await tenant.save();

    if (decision === 'approved') {
      await deactivateSystemNotice(String(tenant._id), 'kyc_required');
      await upsertSystemNotice({
        tenantId: tenant._id,
        dedupeKey: 'kyc_approved',
        title: 'KYC approved',
        message: 'Your business verification is approved. Full sending is unlocked.',
        severity: 'info',
        category: 'account',
      });
    } else {
      await deactivateSystemNotice(String(tenant._id), 'kyc_approved');
      await upsertSystemNotice({
        tenantId: tenant._id,
        dedupeKey: 'kyc_required',
        title: 'KYC rejected',
        message: `Your verification was rejected: ${String(reason).trim()} Please re-submit.`,
        severity: 'danger',
        category: 'account',
        actionHref: '/dashboard/settings/kyc',
        actionLabel: 'Re-submit KYC',
      });
    }

    await writeAuditLog({
      ...auditContext(req),
      action: `kyc.${decision}`,
      targetType: 'tenant',
      targetId: String(tenant._id),
      metadata: { reason: String(reason).trim() },
    });

    res.json({ kyc: tenant.kyc });
  } catch (err) {
    next(err);
  }
}
