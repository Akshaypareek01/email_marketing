import mongoose from 'mongoose';

const emailThreadMessageSchema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailThread', required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox', required: true, index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    fromAddress: { type: String, required: true, lowercase: true, trim: true },
    toAddress: { type: String, required: true, lowercase: true, trim: true },
    fromName: { type: String, trim: true },
    subject: { type: String, default: '(no subject)', trim: true },
    textBody: { type: String, default: '' },
    htmlBody: { type: String },
    /** RFC 5322 Message-ID without angle brackets, for threading */
    rfcMessageId: { type: String, trim: true },
    inReplyTo: { type: String, trim: true },
    sesMessageId: { type: String, trim: true },
    attachments: [
      {
        filename: { type: String, required: true, trim: true },
        contentType: { type: String, required: true, trim: true },
        size: { type: Number, required: true, min: 0 },
        /** base64 file bytes; excluded from list queries */
        content: { type: String, select: false },
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

emailThreadMessageSchema.index({ threadId: 1, createdAt: 1 });
emailThreadMessageSchema.index(
  { mailboxId: 1, rfcMessageId: 1 },
  { unique: true, partialFilterExpression: { rfcMessageId: { $type: 'string', $ne: '' } } }
);

export const EmailThreadMessage = mongoose.model('EmailThreadMessage', emailThreadMessageSchema);
