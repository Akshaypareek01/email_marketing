import { createUpload, confirmUpload, submitForReview } from '../services/kyc.service.js';
import { KycDocument } from '../models/KycDocument.js';
import { Tenant } from '../models/Tenant.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

/** Tenant: current KYC status + uploaded documents (no storage keys exposed). */
export async function getKycStatus(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.user.tenantId).select('kyc').lean();
    const documents = await KycDocument.find({ tenantId: req.user.tenantId })
      .select('docType status originalName sizeBytes uploadedAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ kyc: tenant?.kyc || { status: 'none' }, documents });
  } catch (err) {
    next(err);
  }
}

/** Tenant admin: get a presigned PUT URL to upload one document directly to R2. */
export async function requestUploadUrl(req, res, next) {
  try {
    const { docType, mimeType, sizeBytes, originalName } = req.body;
    const out = await createUpload({
      tenantId: req.user.tenantId,
      userId: req.user._id,
      docType,
      mimeType,
      sizeBytes: Number(sizeBytes),
      originalName,
    });
    res.json({ uploadUrl: out.url, key: out.key, expiresIn: out.expiresIn });
  } catch (err) {
    next(err);
  }
}

/** Tenant admin: confirm the bytes landed in R2 (HEAD-verified). */
export async function confirmUploadHandler(req, res, next) {
  try {
    const document = await confirmUpload({ tenantId: req.user.tenantId, key: req.body.key });
    res.json({ document });
  } catch (err) {
    next(err);
  }
}

/** Tenant admin: submit the completed KYC for super-admin review. */
export async function submitKyc(req, res, next) {
  try {
    const { legalName, panNumber, gstNumber } = req.body;
    const kyc = await submitForReview({
      tenantId: req.user.tenantId,
      legalName,
      panNumber,
      gstNumber,
    });
    await writeAuditLog({
      ...auditContext(req),
      action: 'kyc.submitted',
      targetType: 'tenant',
      targetId: String(req.user.tenantId),
    });
    res.json({ kyc });
  } catch (err) {
    next(err);
  }
}
