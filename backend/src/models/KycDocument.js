import mongoose from 'mongoose';

/**
 * One uploaded KYC file. A tenant has at most one current `uploaded` document per
 * docType; re-uploads replace the previous one (see kyc.service.confirmUpload).
 */
const kycDocumentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    docType: { type: String, enum: ['pan', 'gst'], required: true },
    /** R2 object key — private; never exposed directly to clients. */
    storageKey: { type: String, required: true },
    originalName: { type: String, default: '' },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, default: 0 },
    /** pending = presigned URL issued, bytes not yet confirmed; uploaded = HEAD-verified in R2. */
    status: { type: String, enum: ['pending', 'uploaded'], default: 'pending', index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

kycDocumentSchema.index({ tenantId: 1, docType: 1, status: 1 });

export const KycDocument = mongoose.model('KycDocument', kycDocumentSchema);
