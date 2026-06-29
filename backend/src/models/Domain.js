import mongoose from 'mongoose';

const dnsRecordSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    host: { type: String, required: true },
    value: { type: String, required: true },
    purpose: { type: String, enum: ['verification', 'dkim', 'spf', 'dmarc', 'mx', 'mail_from', 'bimi'], required: true },
    verified: { type: Boolean, default: false },
  },
  { _id: true }
);

const domainSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'verifying', 'active', 'failed'],
      default: 'pending',
    },
    sesIdentityArn: { type: String },
    verifiedForSending: {
      type: Boolean,
      default: false,
    },
    dkimStatus: {
      type: String,
      enum: [
        'PENDING',
        'SUCCESS',
        'FAILED',
        'TEMPORARY_FAILURE',
        'NOT_STARTED',
      ],
      default: 'PENDING',
    },
    dnsRecords: [dnsRecordSchema],
    lastCheckedAt: { type: Date },
    failureReason: { type: String },
    /** Sender branding — display name + logo for inbox clients (BIMI) and templates. */
    branding: {
      fromDisplayName: { type: String, default: '', trim: true },
      /** Public HTTPS URL (PNG/JPG in email; SVG for Gmail BIMI avatar). */
      logoUrl: { type: String, default: '', trim: true },
      logoStorageKey: { type: String, default: '', trim: true },
    },
  },
  { timestamps: true }
);

domainSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Domain = mongoose.model('Domain', domainSchema);
