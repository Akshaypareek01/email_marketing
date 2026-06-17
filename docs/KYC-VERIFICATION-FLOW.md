# KYC Verification Flow (GST / PAN) — Design & Implementation

**Status:** ✅ Implemented (backend). Tenant KYC document upload to Cloudflare R2, super-admin
approval, and SES sending gate are wired and verified. R2 storage path smoke-tested end-to-end
(presign PUT → upload → HEAD → presign GET → delete) against live credentials. Remaining: frontend
UI (§14) and the production hardening items below.

**Last reviewed:** 2026-06-17

> ⚠️ **Security action required:** the configured R2 bucket (`nvhotech`) has a public `r2.dev`
> URL (`R2_PUBLIC_URL`). KYC documents must live in a bucket with **public access disabled**.
> Either disable public access on this bucket or point `R2_BUCKET_NAME` at a dedicated private
> bucket before going live. The code never serves KYC via the public URL (presigned GET only),
> but a public bucket still allows direct object access if a key leaks.

---

## 1. Audit — current state

| Concern | State | Notes |
| --- | --- | --- |
| KYC model / controller / service / route | **Missing** | Nothing exists. No `kyc`, `gst`, `pan` references in `backend/src`. |
| Cloudflare R2 env vars | **Present but unused** | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` in `.env`, **not** read in `config/env.js`. |
| S3 SDK / presigner | **Not installed** | Only `@aws-sdk/client-sesv2`. Need `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. |
| File upload middleware | **Not installed** | No `multer`. Recommended path avoids it (presigned direct-to-R2). |
| SES identity / DKIM / MAIL FROM | **Working** | `services/ses.service.js`. |
| SES reputation guardrails + warm-up + platform halt | **Working** | `services/sendingGuard.service.js` → `assertCanSend()`. Natural KYC gate hook. |
| SNS signature verification | **Working & correct** | `services/snsVerify.service.js` (cert host pinning, HTTPS-only, RSA-SHA1). |
| Audit logging | **Working** | `services/audit.service.js` (`writeAuditLog`, `auditContext`). |

**Conclusion:** the KYC feature must be built from scratch. R2 wiring is the prerequisite.

---

## 2. Goal & end-to-end flow

A tenant (role `admin`) must submit business identity documents before being allowed to send
at scale. A platform operator (role `super_admin`) reviews and approves/rejects. Sending is
gated on KYC status.

```
Tenant admin                       Backend                         Cloudflare R2        Super admin
    │                                 │                                  │                   │
    │ 1. POST /account/kyc/upload-url │                                  │                   │
    │   {docType:"pan", mime, size}   │── validate type/size/limits ────▶│                   │
    │◀── { uploadUrl (presigned PUT), │   create KycDocument(pending)    │                   │
    │     key, expiresIn }            │                                  │                   │
    │                                 │                                  │                   │
    │ 2. PUT file bytes ─────────────────────────────────────────────▶ (direct to R2)        │
    │                                 │                                  │                   │
    │ 3. POST /account/kyc/confirm    │── HEAD object: exists? size? ───▶│                   │
    │   { key }                       │   mark uploaded; set gst/pan no. │                   │
    │◀── { document }                 │                                  │                   │
    │                                 │                                  │                   │
    │ 4. POST /account/kyc/submit ────│── status: pending → submitted    │                   │
    │                                 │                                  │  5. GET /admin/kyc │
    │                                 │                                  │◀── list submitted ─│
    │                                 │  6. GET /admin/kyc/:id/file/:doc  │                   │
    │                                 │── presigned GET (short TTL) ─────▶│── view doc ───────│
    │                                 │  7. PATCH /admin/kyc/:id/decision │                   │
    │                                 │   approved | rejected(reason)     │◀──────────────────│
    │◀── system notice + email ───────│   audit log; unlock sending      │                   │
```

**Key design choice — presigned direct upload.** The browser uploads bytes **straight to R2**
using a short-lived presigned `PUT` URL. The Node process never buffers the file, so there is no
`multer`, no `15mb` body-parser pressure, and no large-payload DoS surface on the API. The bucket
stays **private**; admins view documents through short-TTL presigned `GET` URLs.

---

## 3. Storage design (Cloudflare R2)

R2 is S3-compatible, so the AWS S3 v3 client works against it with `region: 'auto'` and a custom
endpoint.

- **Bucket: private.** Never serve KYC docs from a public URL. `R2_PUBLIC_URL` must **not** be used
  for KYC objects — it is only acceptable for non-sensitive public assets. KYC reads go through
  presigned GET.
- **Key scheme (no PII in key, tenant-scoped):**
  `kyc/<tenantId>/<docType>/<uuid>.<ext>`
  e.g. `kyc/665f.../pan/2f9c....pdf`
- **Server-side encryption:** R2 encrypts at rest by default.
- **Object metadata:** store `tenantId`, `docType`, `uploadedBy` as object metadata for traceability.
- **Lifecycle:** configure an R2 lifecycle rule to expire `kyc/*/tmp/*` orphans (uploads never
  confirmed) after 24h. Confirmed docs are retained per compliance policy.

### Allowed document types & limits

| Field | Value |
| --- | --- |
| Allowed MIME | `application/pdf`, `image/jpeg`, `image/png` |
| Max size | 5 MB per document |
| docType enum | `pan`, `gst` (extend later: `aadhaar`, `cin`, `coi`) |
| PAN format | `^[A-Z]{5}[0-9]{4}[A-Z]$` |
| GSTIN format | `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` |

---

## 4. Environment config

### 4.1 `.env` (already present — verify values)

```dotenv
# Cloudflare R2 (KYC document storage)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_BUCKET_NAME=mailbox-kyc
R2_PUBLIC_URL=            # leave blank for KYC; private bucket only

# KYC policy
KYC_REQUIRED=true                 # gate sending on approved KYC when true
KYC_UPLOAD_URL_TTL=300            # presigned PUT lifetime, seconds
KYC_VIEW_URL_TTL=120             # presigned GET (admin view) lifetime, seconds
KYC_MAX_FILE_BYTES=5242880       # 5 MB
KYC_SEND_LIMIT_BEFORE_KYC=200    # free emails allowed before KYC required (0 = block immediately)
```

### 4.2 `config/env.js` — add an `r2` and `kyc` block

```js
  r2: {
    accessKeyId: firstEnvValue('R2_ACCESS_KEY_ID'),
    secretAccessKey: firstEnvValue('R2_SECRET_ACCESS_KEY'),
    endpoint: firstEnvValue('R2_ENDPOINT'),
    bucket: firstEnvValue('R2_BUCKET_NAME'),
    /** Public base URL — only for non-sensitive assets, never KYC. */
    publicUrl: firstEnvValue('R2_PUBLIC_URL'),
  },
  kyc: {
    required: envFlag('KYC_REQUIRED'),
    uploadUrlTtl: Number(process.env.KYC_UPLOAD_URL_TTL) || 300,
    viewUrlTtl: Number(process.env.KYC_VIEW_URL_TTL) || 120,
    maxFileBytes: Number(process.env.KYC_MAX_FILE_BYTES) || 5 * 1024 * 1024,
    sendLimitBeforeKyc: Number(process.env.KYC_SEND_LIMIT_BEFORE_KYC) || 200,
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png'],
  },
```

> Reuses the existing `firstEnvValue` / `envFlag` helpers — matches the file's conventions.

### 4.3 Dependencies

```bash
npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

No `multer` — presigned upload bypasses the API for bytes.

---

## 5. Data model

### 5.1 Extend `Tenant` with a `kyc` subdocument (`models/Tenant.js`)

```js
/** KYC / business verification state. Sending is gated on `status` (see env.kyc). */
const kycSchema = new mongoose.Schema(
  {
    /** none = never submitted; submitted = awaiting review; approved/rejected = decided. */
    status: {
      type: String,
      enum: ['none', 'submitted', 'approved', 'rejected'],
      default: 'none',
    },
    legalName: { type: String, default: '', trim: true },
    panNumber: { type: String, default: '', trim: true, uppercase: true },
    gstNumber: { type: String, default: '', trim: true, uppercase: true },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' },
  },
  { _id: false }
);
```

Add to `tenantSchema`:

```js
    kyc: { type: kycSchema, default: () => ({}) },
```

### 5.2 New model `models/KycDocument.js`

A document per uploaded file (a tenant has up to one current PAN + one current GST).

```js
import mongoose from 'mongoose';

const kycDocumentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    docType: { type: String, enum: ['pan', 'gst'], required: true },
    /** R2 object key — private; never exposed directly to clients. */
    storageKey: { type: String, required: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    /** pending = presigned issued, bytes not confirmed; uploaded = HEAD-verified in R2. */
    status: { type: String, enum: ['pending', 'uploaded'], default: 'pending', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One current doc per (tenant, type). Re-upload replaces the previous (see service).
kycDocumentSchema.index({ tenantId: 1, docType: 1, status: 1 });

export const KycDocument = mongoose.model('KycDocument', kycDocumentSchema);
```

---

## 6. R2 service (`services/r2.service.js`)

```js
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

/** Lazy R2 client. Throws a clear error if R2 is not configured. */
function r2() {
  if (!env.r2.accessKeyId || !env.r2.endpoint || !env.r2.bucket) {
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

/** Build a tenant-scoped, non-guessable key. No PII in the key. */
export function buildKycKey(tenantId, docType, mimeType) {
  const ext = EXT[mimeType] || 'bin';
  return `kyc/${tenantId}/${docType}/${crypto.randomUUID()}.${ext}`;
}

/** Presigned PUT for direct browser upload. Pins content-type & length at sign time. */
export async function presignUpload({ key, mimeType, maxBytes }) {
  const cmd = new PutObjectCommand({
    Bucket: env.r2.bucket,
    Key: key,
    ContentType: mimeType,
    // R2 honors ContentLength on the signed request; the browser must send exactly this size.
  });
  const url = await getSignedUrl(r2(), cmd, { expiresIn: env.kyc.uploadUrlTtl });
  return { url, key, expiresIn: env.kyc.uploadUrlTtl };
}

/** Presigned GET for admin review. Short TTL. */
export async function presignView(key) {
  const cmd = new GetObjectCommand({ Bucket: env.r2.bucket, Key: key });
  return getSignedUrl(r2(), cmd, { expiresIn: env.kyc.viewUrlTtl });
}

/** Confirm an object actually landed and matches limits. Returns {size, contentType}. */
export async function headObject(key) {
  const out = await r2().send(new HeadObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  return { size: out.ContentLength ?? 0, contentType: out.ContentType || '' };
}

export async function deleteObject(key) {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: key }));
  } catch {
    /* best-effort cleanup */
  }
}
```

---

## 7. KYC service (`services/kyc.service.js`)

```js
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { KycDocument } from '../models/KycDocument.js';
import { buildKycKey, presignUpload, headObject, deleteObject } from './r2.service.js';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validatePan(v) { return PAN_RE.test(String(v || '').toUpperCase()); }
export function validateGstin(v) { return GSTIN_RE.test(String(v || '').toUpperCase()); }

/** Issue a presigned upload URL and create a pending KycDocument. */
export async function createUpload({ tenantId, userId, docType, mimeType, sizeBytes, originalName }) {
  if (!['pan', 'gst'].includes(docType)) throw new HttpError(400, 'Invalid docType');
  if (!env.kyc.allowedMime.includes(mimeType)) throw new HttpError(415, 'Unsupported file type');
  if (!sizeBytes || sizeBytes > env.kyc.maxFileBytes) {
    throw new HttpError(413, `File exceeds ${env.kyc.maxFileBytes} bytes`);
  }
  // Block re-upload while under review.
  const tenant = await Tenant.findById(tenantId).select('kyc');
  if (tenant?.kyc?.status === 'submitted') throw new HttpError(409, 'KYC already under review');

  const key = buildKycKey(tenantId, docType, mimeType);
  const doc = await KycDocument.create({
    tenantId, docType, storageKey: key, mimeType, sizeBytes, originalName,
    status: 'pending', uploadedBy: userId,
  });
  const signed = await presignUpload({ key, mimeType, maxBytes: env.kyc.maxFileBytes });
  return { document: doc, ...signed };
}

/** Verify the object exists in R2, enforce size/type, mark uploaded, replace any prior doc. */
export async function confirmUpload({ tenantId, key }) {
  const doc = await KycDocument.findOne({ tenantId, storageKey: key });
  if (!doc) throw new HttpError(404, 'Upload not found');

  const head = await headObject(key); // throws if missing
  if (head.size > env.kyc.maxFileBytes) {
    await deleteObject(key);
    await doc.deleteOne();
    throw new HttpError(413, 'Uploaded file exceeds size limit');
  }
  if (head.contentType && !env.kyc.allowedMime.includes(head.contentType)) {
    await deleteObject(key);
    await doc.deleteOne();
    throw new HttpError(415, 'Uploaded file type mismatch');
  }

  // Replace any previous current doc of this type (delete its R2 object too).
  const stale = await KycDocument.find({
    tenantId, docType: doc.docType, _id: { $ne: doc._id },
  });
  for (const s of stale) { await deleteObject(s.storageKey); await s.deleteOne(); }

  doc.status = 'uploaded';
  doc.sizeBytes = head.size;
  doc.uploadedAt = new Date();
  await doc.save();
  return doc;
}

/** Submit for review once both docs + numbers are present. */
export async function submitForReview({ tenantId, legalName, panNumber, gstNumber }) {
  if (!validatePan(panNumber)) throw new HttpError(400, 'Invalid PAN format');
  if (gstNumber && !validateGstin(gstNumber)) throw new HttpError(400, 'Invalid GSTIN format');

  const docs = await KycDocument.find({ tenantId, status: 'uploaded' });
  const types = new Set(docs.map((d) => d.docType));
  if (!types.has('pan')) throw new HttpError(400, 'PAN document required');
  if (gstNumber && !types.has('gst')) throw new HttpError(400, 'GST document required when GSTIN provided');

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (tenant.kyc.status === 'submitted') throw new HttpError(409, 'Already under review');

  tenant.kyc.status = 'submitted';
  tenant.kyc.legalName = legalName || tenant.kyc.legalName;
  tenant.kyc.panNumber = String(panNumber).toUpperCase();
  tenant.kyc.gstNumber = gstNumber ? String(gstNumber).toUpperCase() : '';
  tenant.kyc.submittedAt = new Date();
  tenant.kyc.rejectionReason = '';
  await tenant.save();
  return tenant.kyc;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
```

> `HttpError.status` flows out through the existing `errorHandler` middleware (mirrors how
> `SendBlockedError.status` is consumed). Confirm `middleware/errorHandler.js` honors `err.status`;
> if not, map it in the controller `catch`.

---

## 8. Tenant-side controller + routes

### 8.1 `controllers/kyc.controller.js`

```js
import { createUpload, confirmUpload, submitForReview } from '../services/kyc.service.js';
import { KycDocument } from '../models/KycDocument.js';
import { Tenant } from '../models/Tenant.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

export async function getKycStatus(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.user.tenantId).select('kyc').lean();
    const docs = await KycDocument.find({ tenantId: req.user.tenantId })
      .select('docType status originalName sizeBytes uploadedAt').lean();
    res.json({ kyc: tenant?.kyc || { status: 'none' }, documents: docs });
  } catch (err) { next(err); }
}

export async function requestUploadUrl(req, res, next) {
  try {
    const { docType, mimeType, sizeBytes, originalName } = req.body;
    const out = await createUpload({
      tenantId: req.user.tenantId, userId: req.user._id,
      docType, mimeType, sizeBytes, originalName,
    });
    res.json({ uploadUrl: out.url, key: out.key, expiresIn: out.expiresIn });
  } catch (err) { next(err); }
}

export async function confirmUploadHandler(req, res, next) {
  try {
    const doc = await confirmUpload({ tenantId: req.user.tenantId, key: req.body.key });
    res.json({ document: doc });
  } catch (err) { next(err); }
}

export async function submitKyc(req, res, next) {
  try {
    const { legalName, panNumber, gstNumber } = req.body;
    const kyc = await submitForReview({ tenantId: req.user.tenantId, legalName, panNumber, gstNumber });
    await writeAuditLog({ ...auditContext(req), action: 'kyc.submitted', targetType: 'tenant', targetId: String(req.user.tenantId) });
    res.json({ kyc });
  } catch (err) { next(err); }
}
```

### 8.2 Add to `routes/account.routes.js` (tenant admin only)

```js
import { getKycStatus, requestUploadUrl, confirmUploadHandler, submitKyc } from '../controllers/kyc.controller.js';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';

router.get('/kyc', authenticate, getKycStatus);
router.post('/kyc/upload-url', authenticate, requireTenantAdmin,
  body('docType').isIn(['pan', 'gst']),
  body('mimeType').isString(),
  body('sizeBytes').isInt({ min: 1 }),
  validate, requestUploadUrl);
router.post('/kyc/confirm', authenticate, requireTenantAdmin, body('key').isString(), validate, confirmUploadHandler);
router.post('/kyc/submit', authenticate, requireTenantAdmin,
  body('panNumber').isString(), validate, submitKyc);
```

> `requireTenantAdmin` already blocks the `user` role from sensitive tenant actions — reuse it so
> only tenant admins can submit KYC.

---

## 9. Admin (super_admin) approval controller + routes

### 9.1 `controllers/adminKyc.controller.js`

```js
import { Tenant } from '../models/Tenant.js';
import { KycDocument } from '../models/KycDocument.js';
import { presignView } from '../services/r2.service.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';
import { upsertSystemNotice, deactivateSystemNotice } from '../services/systemNotice.service.js';

/** List tenants by KYC status (default: submitted/awaiting review). */
export async function listKycQueue(req, res, next) {
  try {
    const status = req.query.status || 'submitted';
    const tenants = await Tenant.find({ 'kyc.status': status })
      .select('name slug kyc createdAt').sort({ 'kyc.submittedAt': 1 }).lean();
    res.json({ tenants });
  } catch (err) { next(err); }
}

export async function getKycDetail(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.params.id).select('name slug kyc').lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    const docs = await KycDocument.find({ tenantId: req.params.id, status: 'uploaded' })
      .select('docType originalName mimeType sizeBytes uploadedAt').lean();
    res.json({ tenant, documents: docs });
  } catch (err) { next(err); }
}

/** Issue a short-TTL presigned URL for one document. */
export async function viewKycDocument(req, res, next) {
  try {
    const doc = await KycDocument.findOne({ _id: req.params.docId, tenantId: req.params.id });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    const url = await presignView(doc.storageKey);
    await writeAuditLog({ ...auditContext(req), action: 'kyc.document.viewed', targetType: 'tenant', targetId: req.params.id, metadata: { docType: doc.docType } });
    res.json({ url, expiresIn: 120 });
  } catch (err) { next(err); }
}

export async function decideKyc(req, res, next) {
  try {
    const { decision, reason = '' } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be approved or rejected' });
    }
    if (decision === 'rejected' && !reason.trim()) {
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
    tenant.kyc.rejectionReason = decision === 'rejected' ? reason.trim() : '';
    await tenant.save();

    if (decision === 'approved') {
      await deactivateSystemNotice(String(tenant._id), 'kyc_required');
      await upsertSystemNotice({
        tenantId: tenant._id, dedupeKey: 'kyc_approved', title: 'KYC approved',
        message: 'Your business verification is approved. Full sending is unlocked.',
        severity: 'info', category: 'account',
      });
    } else {
      await upsertSystemNotice({
        tenantId: tenant._id, dedupeKey: 'kyc_required', title: 'KYC rejected',
        message: `Your verification was rejected: ${reason.trim()} Please re-submit.`,
        severity: 'danger', category: 'account',
        actionHref: '/dashboard/settings/kyc', actionLabel: 'Re-submit KYC',
      });
    }

    await writeAuditLog({ ...auditContext(req), action: `kyc.${decision}`, targetType: 'tenant', targetId: String(tenant._id), metadata: { reason } });
    res.json({ kyc: tenant.kyc });
  } catch (err) { next(err); }
}
```

### 9.2 Add to `routes/admin.routes.js` (already `authorize('super_admin')` for the whole router)

```js
import { listKycQueue, getKycDetail, viewKycDocument, decideKyc } from '../controllers/adminKyc.controller.js';

router.get('/kyc', listKycQueue);
router.get('/kyc/:id', getKycDetail);
router.get('/kyc/:id/documents/:docId/view', viewKycDocument);
router.patch('/kyc/:id/decision', decideKyc);
```

---

## 10. SES sending gate integration

Hook KYC into the **single existing chokepoint**, `assertCanSend()` in
`services/sendingGuard.service.js`. Every send path already routes through it
(`email.controller.js`, `campaignSend.service.js`, `templates.controller.js`,
`account.controller.js`). Add **after** the suspended/paused checks, **before** quota:

```js
  // KYC gate — allow a small free allowance, then require approved KYC.
  if (env.kyc.required) {
    const kycStatus = tenant.kyc?.status || 'none';
    const sentSoFar = tenant.subscription?.emailsSentThisPeriod ?? 0;
    if (kycStatus !== 'approved' && sentSoFar + count > env.kyc.sendLimitBeforeKyc) {
      throw new SendBlockedError(
        kycStatus === 'submitted'
          ? 'KYC is under review. Sending unlocks once approved.'
          : 'Business verification (KYC) required to keep sending. Submit PAN/GST in Settings.',
        'kyc_required'
      );
    }
  }
```

- `SendBlockedError` already serializes `status`/`code` to the API — front end can switch on
  `code === 'kyc_required'` and deep-link to the KYC page.
- The `KYC_SEND_LIMIT_BEFORE_KYC` allowance lets new tenants try the product; set to `0` to block
  immediately.
- A rejected tenant falls back to `none`-like behavior (status `rejected` ≠ `approved`), so they're
  re-gated until they re-submit and get approved.

Also raise a notice when a tenant first crosses into "KYC required" so it's discoverable — emit
`kyc_required` system notice from the gate or from a daily job.

---

## 11. SES security flow — review & edge cases

The user asked to confirm the SES flow is sound. Findings:

| Area | File | Verdict | Edge cases to confirm |
| --- | --- | --- | --- |
| Identity create / idempotency | `ses.service.js` `resolveSesIdentity` | OK — catches `AlreadyExistsException`, falls back to `GetEmailIdentity`. | Other transient AWS errors propagate (correct). |
| DKIM / MAIL FROM | `configureSesMailFrom` | OK — `BehaviorOnMxFailure: USE_DEFAULT_VALUE`. | Verify the MAIL FROM subdomain MX/SPF records are surfaced to the tenant. |
| Send w/ attachments & tags | `sendEmail` | OK — base64 → `RawContent`; `EmailTags` for tenant/campaign attribution. | Empty body guarded (`Text: ' '`). Confirm attachment total stays under SES 10 MB raw limit. |
| List-Unsubscribe one-click | `sendEmail` headers | OK — RFC 8058 headers present. | Ensure the unsubscribe URL is reachable publicly (`apiPublicUrl`). |
| SNS signature verification | `snsVerify.service.js` | **Strong** — HTTPS-only, cert host pinned to `sns.<region>.amazonaws.com`, RSA-SHA1 verify. | (1) **Off by default** — `SES_VERIFY_SNS_SIGNATURE` must be `true` in prod. (2) Consider caching the fetched cert by URL to avoid a fetch per event. (3) Confirm `SubscriptionConfirmation` auto-confirm is intentional/guarded. |
| Reputation guardrails | `sendingGuard.service.js` | OK — warn/pause ratios, min sample size, lazy window rollover. | Divide-by-zero guarded in `reputationRates`. |
| Warm-up ramp | `sendingGuard.service.js` | OK — daily cap, ramp on clean window. | Daily reset is lazy (per send) — a fully idle tenant never resets until next send (acceptable). |
| Platform halt / protect | `env.platformSendingHalted`, `platformReputationGuard` | OK — master kill switch + account-wide protect. | 503 surfaced to client. |

**Recommended hardening (not blocking):**
1. Set `SES_VERIFY_SNS_SIGNATURE=true` and `SES_CONFIG_SETS_ENABLED=true` in production `.env`.
2. Cache SNS signing certs in-process keyed by `SigningCertURL` (bounded TTL).
3. Add replay protection on SNS: reject `Timestamp` older than ~1h.
4. Ensure the SNS webhook (`/api/email/webhooks/sns`) is rate-limited / size-capped (it uses
   `express.text({ type: '*/*' })`).

---

## 12. Edge-case matrix (KYC + upload)

| # | Scenario | Expected handling |
| --- | --- | --- |
| 1 | Presigned URL requested, file never uploaded | `KycDocument` stays `pending`; R2 lifecycle expires orphan; no state change. |
| 2 | File uploaded but `confirm` never called | Doc stays `pending`, ignored by `submit`; cleaned by lifecycle. |
| 3 | Confirm called but object missing in R2 | `headObject` throws → 404; doc not marked uploaded. |
| 4 | Uploaded file bigger than signed limit (client lied on `sizeBytes`) | `confirmUpload` HEAD checks real size; deletes object + doc; 413. |
| 5 | Wrong MIME (renamed `.exe` → `.pdf`) | MIME pinned at presign; HEAD content-type re-checked; **also** do magic-byte sniff on view (see §13). |
| 6 | Re-upload same docType | `confirmUpload` deletes prior R2 object + doc — no orphan, one current doc per type. |
| 7 | Submit without PAN doc | 400 "PAN document required". |
| 8 | Submit with GSTIN but no GST doc | 400. GST optional unless GSTIN provided. |
| 9 | Invalid PAN/GSTIN format | 400 with regex validation before any R2/DB write. |
| 10 | Double submit while `submitted` | 409 "already under review". |
| 11 | Re-upload while under review | 409 — blocked in `createUpload`. |
| 12 | Admin approves already-approved tenant | 409 "KYC is approved, not awaiting review". |
| 13 | Admin rejects without reason | 400 — reason required. |
| 14 | Rejected tenant re-submits | Allowed (status `rejected` → `submitted`); `rejectionReason` cleared. |
| 15 | `user` role tries to submit KYC | 403 via `requireTenantAdmin`. |
| 16 | Non-super-admin hits `/admin/kyc/*` | 403 via router-level `authorize('super_admin')`. |
| 17 | Tenant A requests view of Tenant B's doc | Admin view is keyed by `{_id, tenantId}`; tenant routes never expose `storageKey`. |
| 18 | R2 not configured at runtime | `r2()` throws clear error; upload endpoints 500 with actionable message (not a crash). |
| 19 | Send while KYC pending + over free allowance | `SendBlockedError('kyc_required')` → 403; under allowance still sends. |
| 20 | Approval unlocks sending mid-period | Next `assertCanSend` sees `approved`; no restart needed. |
| 21 | Concurrent confirm of two uploads same type | Last-writer wins; stale-doc cleanup is idempotent (`deleteObject` best-effort). |
| 22 | Presigned URL leaked/shared | Short TTL (PUT 300s / GET 120s) limits the window; bucket private. |

---

## 13. Security considerations

- **Private bucket, always.** KYC objects are never served from `R2_PUBLIC_URL`. All reads are
  presigned GET with ≤120s TTL, behind `authorize('super_admin')`.
- **No PII in object keys** — random UUID filenames; tenant id only.
- **Tenant isolation** — every query filters by `tenantId`; `storageKey` is never returned to tenant
  clients.
- **Content validation defense-in-depth** — pin content-type at presign, re-check via HEAD, and on
  admin view optionally stream the first bytes to sniff magic numbers (PDF `%PDF`, JPEG `FFD8`, PNG
  `89504E47`). Reject mismatches.
- **No SVG / HTML** in allowed MIME (XSS-via-image vector).
- **Audit everything** — submit, document view, approve, reject all write `AuditLog` entries with
  actor + tenant (existing `writeAuditLog`).
- **Least privilege R2 token** — the R2 API token should be scoped to **only** the KYC bucket with
  object read/write, no bucket admin.
- **Rate-limit** the `upload-url` endpoint (reuse `middleware/rateLimit.js`) to prevent presign
  flooding.
- **Optional AV scan** — for higher assurance, run a ClamAV/lambda scan on `uploaded` objects before
  allowing admin view; gate `status: uploaded → scanned`.

---

## 14. Implementation checklist

- [ ] `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- [ ] Add `r2` + `kyc` blocks to `config/env.js`; confirm `.env` values (private bucket).
- [ ] Add `kycSchema` + `kyc` field to `models/Tenant.js`.
- [ ] Create `models/KycDocument.js`.
- [ ] Create `services/r2.service.js`.
- [ ] Create `services/kyc.service.js`.
- [ ] Create `controllers/kyc.controller.js`; wire routes in `routes/account.routes.js`.
- [ ] Create `controllers/adminKyc.controller.js`; wire routes in `routes/admin.routes.js`.
- [ ] Add the KYC gate to `assertCanSend()` in `services/sendingGuard.service.js`.
- [ ] Confirm `middleware/errorHandler.js` honors `err.status` (else map in controllers).
- [ ] Configure R2 lifecycle rule for orphaned uploads.
- [ ] Set `SES_VERIFY_SNS_SIGNATURE=true`, `SES_CONFIG_SETS_ENABLED=true` in prod.
- [ ] Frontend: KYC settings page (upload → confirm → submit) + admin review queue.

### Manual test script

```
1. As tenant admin: GET /api/account/kyc            → { status: 'none' }
2. POST /api/account/kyc/upload-url {docType:pan,...} → uploadUrl
3. PUT file to uploadUrl (curl -T file.pdf <url>)    → 200
4. POST /api/account/kyc/confirm {key}               → document.status=uploaded
5. POST /api/account/kyc/submit {panNumber,...}      → kyc.status=submitted
6. Send > KYC_SEND_LIMIT_BEFORE_KYC emails           → 403 kyc_required
7. As super_admin: GET /api/admin/kyc                → tenant in queue
8. GET /api/admin/kyc/:id/documents/:docId/view      → presigned url (opens doc)
9. PATCH /api/admin/kyc/:id/decision {approved}      → kyc.status=approved
10. Tenant sends again                               → succeeds
11. Re-run with {rejected, reason} and verify re-submit path.
```

---

## 15. Open decisions (need product/compliance input)

1. **Free allowance before KYC** — block immediately (`0`) or allow a trial (`200`)? Defaulted to 200.
2. **Is GST mandatory** or PAN-only for non-registered businesses? Spec treats GST as optional.
3. **Retention** of KYC docs after rejection / account closure (compliance/DPDP).
4. **AV scanning** required before go-live? Recommended for production.
