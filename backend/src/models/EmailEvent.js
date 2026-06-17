import mongoose from 'mongoose';

const emailEventSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    messageId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: ['delivered', 'bounced', 'soft_bounced', 'complaint', 'rejected', 'sent', 'opened', 'clicked'],
      required: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const EmailEvent = mongoose.model('EmailEvent', emailEventSchema);
