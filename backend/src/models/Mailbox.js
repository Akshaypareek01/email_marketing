import mongoose from 'mongoose';

const mailboxSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Domain', required: true, index: true },
    address: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    /** AES-GCM encrypted IMAP password for Stalwart sync (per mailbox). */
    imapPasswordEnc: { type: String, select: false },
    stalwartPrincipalId: { type: String },
    stalwartLinked: { type: Boolean, default: false },
    quotaMb: { type: Number, default: 1024 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    imapEnabled: { type: Boolean, default: true },
    jmapEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

mailboxSchema.index({ tenantId: 1, address: 1 }, { unique: true });

export const Mailbox = mongoose.model('Mailbox', mailboxSchema);
