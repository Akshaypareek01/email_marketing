import crypto from 'crypto';
import { env } from '../config/env.js';
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client = null;

/** True when R2 credentials/bucket are present. */
export function isR2Configured() {
  return Boolean(env.r2.accessKeyId && env.r2.secretAccessKey && env.r2.endpoint && env.r2.bucket);
}

/** Lazy R2 client. Throws a clear error if R2 is not configured. */
function r2() {
  if (!isR2Configured()) {
    throw new Error('R2 storage is not configured (R2_ENDPOINT / R2_BUCKET_NAME / keys).');
  }
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: env.r2.endpoint,
      credentials: {
        accessKeyId: env.r2.accessKeyId,
        secretAccessKey: env.r2.secretAccessKey,
      },
    });
  }
  return _client;
}

const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Build a tenant-scoped, non-guessable object key. No PII in the key. */
export function buildKycKey(tenantId, docType, mimeType) {
  const ext = EXT[mimeType] || 'bin';
  return `kyc/${tenantId}/${docType}/${crypto.randomUUID()}.${ext}`;
}

/** Presigned PUT for direct browser upload. Pins content-type at sign time. */
export async function presignUpload({ key, mimeType }) {
  const cmd = new PutObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ContentType: mimeType,
  });
  const url = await getSignedUrl(r2(), cmd, { expiresIn: env.kyc.uploadUrlTtl });
  return { url, key, expiresIn: env.kyc.uploadUrlTtl };
}

/** Presigned GET for admin review. Short TTL. */
export async function presignView(key) {
  const cmd = new GetObjectCommand({ Bucket: env.r2.bucket, Key: key });
  return getSignedUrl(r2(), cmd, { expiresIn: env.kyc.viewUrlTtl });
}

/** Confirm an object actually landed. Returns { size, contentType }. Throws if missing. */
export async function headObject(key) {
  const out = await r2().send(new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  return { size: out.ContentLength ?? 0, contentType: out.ContentType || '' };
}

/** Best-effort delete (cleanup must never break the primary flow). */
export async function deleteObject(key) {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  } catch {
    /* best-effort */
  }
}
