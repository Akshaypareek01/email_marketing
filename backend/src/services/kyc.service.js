import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { KycDocument } from '../models/KycDocument.js';
import {
  buildKycKey,
  presignUpload,
  headObject,
  deleteObject,
  isR2Configured,
} from './r2.service.js';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Thrown with an HTTP status the central errorHandler serializes. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function validatePan(v) {
  return PAN_RE.test(String(v || '').toUpperCase());
}

export function validateGstin(v) {
  return GSTIN_RE.test(String(v || '').toUpperCase());
}

/** Issue a presigned upload URL and create a pending KycDocument. */
export async function createUpload({ tenantId, userId, docType, mimeType, sizeBytes, originalName }) {
  if (!isR2Configured()) throw new HttpError(503, 'Document storage is not configured. Contact support.');
  if (!['pan', 'gst'].includes(docType)) throw new HttpError(400, 'Invalid docType');
  if (!env.kyc.allowedMime.includes(mimeType)) throw new HttpError(415, 'Unsupported file type');
  if (!sizeBytes || sizeBytes > env.kyc.maxFileBytes) {
    throw new HttpError(413, `File exceeds the ${env.kyc.maxFileBytes}-byte limit`);
  }

  // Block re-upload while a submission is under review.
  const tenant = await Tenant.findById(tenantId).select('kyc');
  if (tenant?.kyc?.status === 'submitted') throw new HttpError(409, 'KYC is already under review');

  const key = buildKycKey(tenantId, docType, mimeType);
  const document = await KycDocument.create({
    tenantId,
    docType,
    storageKey: key,
    mimeType,
    sizeBytes,
    originalName: originalName || '',
    status: 'pending',
    uploadedBy: userId,
  });

  const signed = await presignUpload({ key, mimeType });
  return { document, ...signed };
}

/** Verify the object exists in R2, enforce size/type, mark uploaded, replace any prior doc. */
export async function confirmUpload({ tenantId, key }) {
  const doc = await KycDocument.findOne({ tenantId, storageKey: key });
  if (!doc) throw new HttpError(404, 'Upload not found');

  const head = await headObject(key); // throws if the object is missing
  if (head.size > env.kyc.maxFileBytes) {
    await deleteObject(key);
    await doc.deleteOne();
    throw new HttpError(413, 'Uploaded file exceeds the size limit');
  }
  if (head.contentType && !env.kyc.allowedMime.includes(head.contentType)) {
    await deleteObject(key);
    await doc.deleteOne();
    throw new HttpError(415, 'Uploaded file type is not allowed');
  }

  // Replace any previous current doc of this type (and its R2 object).
  const stale = await KycDocument.find({ tenantId, docType: doc.docType, _id: { $ne: doc._id } });
  for (const s of stale) {
    await deleteObject(s.storageKey);
    await s.deleteOne();
  }

  doc.status = 'uploaded';
  doc.sizeBytes = head.size;
  doc.uploadedAt = new Date();
  await doc.save();
  return doc;
}

/** Submit for review once the PAN doc (and GST doc if a GSTIN is given) are present. */
export async function submitForReview({ tenantId, legalName, panNumber, gstNumber }) {
  if (!validatePan(panNumber)) throw new HttpError(400, 'Invalid PAN format');
  if (gstNumber && !validateGstin(gstNumber)) throw new HttpError(400, 'Invalid GSTIN format');

  const docs = await KycDocument.find({ tenantId, status: 'uploaded' });
  const types = new Set(docs.map((d) => d.docType));
  if (!types.has('pan')) throw new HttpError(400, 'PAN document is required');
  if (gstNumber && !types.has('gst')) {
    throw new HttpError(400, 'GST document is required when a GSTIN is provided');
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.kyc.status === 'submitted') throw new HttpError(409, 'KYC is already under review');

  tenant.kyc.status = 'submitted';
  tenant.kyc.legalName = legalName || tenant.kyc.legalName;
  tenant.kyc.panNumber = String(panNumber).toUpperCase();
  tenant.kyc.gstNumber = gstNumber ? String(gstNumber).toUpperCase() : '';
  tenant.kyc.submittedAt = new Date();
  tenant.kyc.reviewedAt = null;
  tenant.kyc.reviewedBy = null;
  tenant.kyc.rejectionReason = '';
  await tenant.save();
  return tenant.kyc;
}
