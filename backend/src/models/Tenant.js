import mongoose from 'mongoose';

/**
 * Per-tenant subscription state. Quota is enforced on every outbound send.
 * `periodStart` anchors the rolling monthly window; `emailsSentThisPeriod` resets
 * lazily when the window rolls over (see sending-guard.service.js).
 */
const subscriptionSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    /** active = paid & sending; trialing = free allowance; past_due/canceled = blocked. */
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled'],
      default: 'trialing',
    },
    /** When the free trial ends. Stamped at signup; null on legacy tenants (derived from createdAt). */
    trialEndsAt: { type: Date, default: null },
    emailsSentThisPeriod: { type: Number, default: 0, min: 0 },
    periodStart: { type: Date, default: () => new Date() },
    /** Snapshot of plan quota so a mid-cycle plan edit can't retroactively change limits. */
    monthlyEmailQuota: { type: Number, default: 100, min: 0 },
    /** One-time add-on emails for the current billing period. */
    quotaBonusThisPeriod: { type: Number, default: 0, min: 0 },
    maxDomains: { type: Number, default: 1, min: 0 },
    maxContacts: { type: Number, default: 500, min: 0 },
    maxTeamUsers: { type: Number, default: 1, min: 0 },
    /** Set when the user cancels — subscription stays active until the period rolls over, then flips to canceled. */
    cancelAtPeriodEnd: { type: Boolean, default: false },
    /** Stamped when the subscription is actually canceled (immediately or at period end). */
    canceledAt: { type: Date, default: null },
  },
  { _id: false }
);

/** Stripe/Razorpay linkage for paid subscriptions. */
const billingProviderSchema = new mongoose.Schema(
  {
    stripeCustomerId: { type: String, default: '', trim: true },
    stripeSubscriptionId: { type: String, default: '', trim: true },
    razorpaySubscriptionId: { type: String, default: '', trim: true },
    /** Pending one-time quota add-on checkout (cleared after payment). */
    pendingQuotaAddonPackId: { type: String, default: '', trim: true },
    pendingQuotaPaymentLinkId: { type: String, default: '', trim: true },
  },
  { _id: false }
);

/**
 * Sending control flags. `paused` is the per-tenant brake (manual or automatic);
 * distinct from Tenant.status === 'suspended', which is a full account suspension.
 */
const sendingSchema = new mongoose.Schema(
  {
    paused: { type: Boolean, default: false },
    pauseReason: { type: String, default: '' },
    /** 'reputation' = tenant guardrails; 'platform_protect' = account-wide auto-pause; 'manual' = operator. */
    pauseSource: {
      type: String,
      enum: ['', 'reputation', 'platform_protect', 'manual', 'quota'],
      default: '',
    },
    pausedAt: { type: Date, default: null },
    reputationWarning: { type: Boolean, default: false },
  },
  { _id: false }
);

/** Warm-up ramp for new/unproven senders (PRD §6.3). */
const warmUpSchema = new mongoose.Schema(
  {
    dailyCap: { type: Number, default: 200, min: 0 },
    dailySent: { type: Number, default: 0, min: 0 },
    dayStart: { type: Date, default: () => new Date() },
    /** Increases dailyCap as reputation proves clean (max = plan quota). */
    rampLevel: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * Rolling reputation counters over `reputation.windowDays`. `windowStart` anchors the window;
 * counters reset lazily when it rolls over. Rates are derived, not stored.
 */
const reputationSchema = new mongoose.Schema(
  {
    windowStart: { type: Date, default: () => new Date() },
    sent: { type: Number, default: 0, min: 0 },
    delivered: { type: Number, default: 0, min: 0 },
    bounced: { type: Number, default: 0, min: 0 },
    complained: { type: Number, default: 0, min: 0 },
    lastEventAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * KYC / business verification state. Sending is gated on `status` once the free
 * allowance is exhausted (see env.kyc and sendingGuard.assertCanSend).
 */
const kycSchema = new mongoose.Schema(
  {
    /** none = never submitted; submitted = awaiting review; approved/rejected = decided. */
    status: {
      type: String,
      enum: ['none', 'submitted', 'approved', 'rejected'],
      default: 'none',
    },
    legalName: { type: String, default: '', trim: true },
    panNumber: { type: String, default: '', trim: true, uppercase: true },
    gstNumber: { type: String, default: '', trim: true, uppercase: true },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' },
  },
  { _id: false }
);

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended', 'restricted'], default: 'active' },
    subscription: { type: subscriptionSchema, default: () => ({}) },
    sending: { type: sendingSchema, default: () => ({}) },
    warmUp: { type: warmUpSchema, default: () => ({}) },
    reputation: { type: reputationSchema, default: () => ({}) },
    /** Per-tenant SES configuration set for event attribution. */
    ses: {
      configSetName: { type: String, default: '', trim: true },
    },
    billing: { type: billingProviderSchema, default: () => ({}) },
    kyc: { type: kycSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model('Tenant', tenantSchema);
