import mongoose from 'mongoose';

const campaignStatsSchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    complained: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactList', required: true },
    fromMailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox', default: null },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'canceled', 'failed'],
      default: 'draft',
    },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    stats: { type: campaignStatsSchema, default: () => ({}) },
    preflightNotes: { type: [String], default: [] },
    attachments: {
      type: [
        {
          filename: { type: String, required: true, trim: true },
          contentType: { type: String, default: 'application/octet-stream' },
          content: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const Campaign = mongoose.model('Campaign', campaignSchema);
