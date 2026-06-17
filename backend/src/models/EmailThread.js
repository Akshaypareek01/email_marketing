import mongoose from 'mongoose';

const emailThreadSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox', required: true, index: true },
    subject: { type: String, default: '(no subject)', trim: true },
    snippet: { type: String, default: '' },
    counterpartyEmail: { type: String, lowercase: true, trim: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    lastDirection: { type: String, enum: ['inbound', 'outbound'], required: true },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

emailThreadSchema.index({ tenantId: 1, mailboxId: 1, lastActivityAt: -1 });

export const EmailThread = mongoose.model('EmailThread', emailThreadSchema);
