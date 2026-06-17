import mongoose from 'mongoose';

/**
 * A billable plan created by a super-admin.
 * Quotas are enforced per billing period (see PRD §5.3 / §5.4).
 */
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    // Price stored in minor units (paise) to avoid float issues.
    priceMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true, trim: true },
    interval: { type: String, enum: ['month', 'year'], default: 'month' },

    // Quotas / limits
    monthlyEmailQuota: { type: Number, required: true, min: 0 },
    maxContacts: { type: Number, default: 0 }, // 0 = unlimited
    maxDomains: { type: Number, default: 1 },
    maxTeamUsers: { type: Number, default: 1 },
    attachmentMb: { type: Number, default: 10 },

    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true }, // shown on pricing page
    sortOrder: { type: Number, default: 0 },
    /** Stripe Price ID (price_...) — for BILLING_PROVIDER=stripe. */
    stripePriceId: { type: String, default: '', trim: true },
    /** Razorpay Plan ID (plan_...) — optional; auto-created if empty. */
    razorpayPlanId: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const Plan = mongoose.model('Plan', planSchema);
