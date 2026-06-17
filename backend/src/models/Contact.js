import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['subscribed', 'unsubscribed', 'bounced', 'complained'],
      default: 'subscribed',
    },
    tags: { type: [String], default: [] },
    source: { type: String, trim: true, default: 'manual' },
    /** Consent captured at import (PRD §6.5). */
    consent: { type: String, trim: true, default: '' },
    softBounceCount: { type: Number, default: 0, min: 0 },
    customFields: { type: Map, of: String, default: () => new Map() },
    listIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ContactList' }],
  },
  { timestamps: true }
);

contactSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const Contact = mongoose.model('Contact', contactSchema);
