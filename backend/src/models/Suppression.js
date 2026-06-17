import mongoose from 'mongoose';

/**
 * Global + per-tenant suppressed addresses (PRD §6.2).
 * Checked on contact import and before send.
 */
const suppressionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    reason: {
      type: String,
      enum: ['bounce', 'complaint', 'unsubscribe', 'manual'],
      required: true,
    },
    source: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

suppressionSchema.index({ email: 1, tenantId: 1 }, { unique: true });

export const Suppression = mongoose.model('Suppression', suppressionSchema);
