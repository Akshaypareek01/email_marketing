import mongoose from 'mongoose';

/**
 * Billing transaction / invoice record (PRD §5.3).
 */
const transactionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    /** direct | stripe | razorpay */
    provider: { type: String, enum: ['direct', 'stripe', 'razorpay'], default: 'direct' },
    /** Provider payment / invoice id for idempotency. */
    externalId: { type: String, default: '', trim: true, index: true },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    description: { type: String, default: '', trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

transactionSchema.index({ tenantId: 1, createdAt: -1 });
transactionSchema.index({ provider: 1, externalId: 1 }, { unique: true, sparse: true });

export const Transaction = mongoose.model('Transaction', transactionSchema);
