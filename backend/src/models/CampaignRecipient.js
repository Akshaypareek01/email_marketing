import mongoose from 'mongoose';

const campaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    error: { type: String, default: '' },
    sesMessageId: { type: String, default: '' },
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaignId: 1, email: 1 }, { unique: true });

export const CampaignRecipient = mongoose.model('CampaignRecipient', campaignRecipientSchema);
