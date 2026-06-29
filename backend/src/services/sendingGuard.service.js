import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { getEffectiveQuota } from './subscription.service.js';
import { isTrialExpired } from './planLimits.service.js';
import { notifySendingAutoPaused, upsertSystemNotice, deactivateSystemNotice } from './systemNotice.service.js';
import { isPlatformSendingHalted, getPlatformDailyUsage, recordPlatformSend } from './platformSettings.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown when a send is blocked. `status` and `code` flow out to the API response. */
export class SendBlockedError extends Error {
  constructor(message, code, status = 403) {
    super(message);
    this.name = 'SendBlockedError';
    this.code = code;
    this.status = status;
  }
}

function periodElapsed(periodStart) {
  if (!periodStart) return true;
  const next = new Date(periodStart);
  next.setMonth(next.getMonth() + 1);
  return Date.now() >= next.getTime();
}

function windowElapsed(windowStart) {
  if (!windowStart) return true;
  return Date.now() - new Date(windowStart).getTime() >= env.reputation.windowDays * DAY_MS;
}

function warmUpDayElapsed(dayStart) {
  if (!dayStart) return true;
  const next = new Date(dayStart);
  next.setDate(next.getDate() + 1);
  return Date.now() >= next.getTime();
}

/** Bounce/complaint fractions, guarding divide-by-zero. */
export function reputationRates(rep = {}) {
  const sent = rep.sent || 0;
  if (sent <= 0) return { bounceRate: 0, complaintRate: 0, sent: 0 };
  return {
    bounceRate: (rep.bounced || 0) / sent,
    complaintRate: (rep.complained || 0) / sent,
    sent,
  };
}

/**
 * Loads a tenant and lazily rolls over quota/reputation/warm-up windows.
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 */
export async function loadTenantForSend(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new SendBlockedError('Account not found', 'tenant_not_found', 404);

  let dirty = false;

  if (periodElapsed(tenant.subscription?.periodStart)) {
    if (tenant.subscription?.cancelAtPeriodEnd) {
      // Scheduled cancellation takes effect now — the paid period has ended.
      tenant.subscription.status = 'canceled';
      tenant.subscription.cancelAtPeriodEnd = false;
      tenant.subscription.canceledAt = new Date();
    } else {
      tenant.subscription.periodStart = new Date();
      tenant.subscription.emailsSentThisPeriod = 0;
      tenant.subscription.quotaBonusThisPeriod = 0;
    }
    dirty = true;
  }

  if (windowElapsed(tenant.reputation?.windowStart)) {
    tenant.reputation.windowStart = new Date();
    tenant.reputation.sent = 0;
    tenant.reputation.delivered = 0;
    tenant.reputation.bounced = 0;
    tenant.reputation.complained = 0;
    dirty = true;
    // NOTE: a window rollover deliberately does NOT auto-resume a reputation-paused
    // tenant. A repeat spammer must not get a clean slate just because time passed —
    // an operator clears the pause (admin sending PATCH) after reviewing list hygiene.
    if (tenant.sending?.reputationWarning) {
      tenant.sending.reputationWarning = false;
    }
  }

  if (warmUpDayElapsed(tenant.warmUp?.dayStart)) {
    tenant.warmUp = tenant.warmUp || {};
    tenant.warmUp.dayStart = new Date();
    tenant.warmUp.dailySent = 0;
    dirty = true;
  }

  if (dirty) await tenant.save();

  if (await isPlatformSendingHalted()) {
    throw new SendBlockedError(
      'Sending is temporarily halted platform-wide for maintenance.',
      'platform_halted',
      503
    );
  }

  // Platform-wide 24h send cap (admin-configurable). Blocks ALL sending once the total
  // across every tenant reaches the limit, protecting the shared AWS SES account.
  const platformUsage = await getPlatformDailyUsage();
  if (platformUsage.exceeded) {
    throw new SendBlockedError(
      'The platform 24-hour sending limit has been reached. Sending resumes after the window resets.',
      'platform_daily_limit',
      503
    );
  }

  return tenant;
}

/**
 * Throws SendBlockedError if this tenant may not send right now.
 * @param {object} tenant
 * @param {number} [count=1]
 */
export function assertCanSend(tenant, count = 1) {
  if (tenant.status === 'suspended') {
    throw new SendBlockedError('Your account is suspended. Contact support.', 'account_suspended');
  }

  if (tenant.status === 'restricted' && tenant.sending?.paused) {
    throw new SendBlockedError(
      tenant.sending.pauseReason || 'Account restricted due to deliverability issues.',
      'account_restricted'
    );
  }

  if (tenant.sending?.paused) {
    throw new SendBlockedError(
      tenant.sending.pauseReason || 'Sending is paused for this account.',
      'sending_paused'
    );
  }

  const sub = tenant.subscription || {};
  if (sub.status === 'past_due') {
    throw new SendBlockedError('Payment is past due. Update billing to resume sending.', 'past_due');
  }
  if (sub.status === 'canceled') {
    throw new SendBlockedError('Your subscription is canceled.', 'subscription_canceled');
  }

  // Free trial is time-boxed: once it lapses, sending stops until a plan is purchased.
  if (isTrialExpired(tenant)) {
    throw new SendBlockedError(
      'Your free trial has ended. Choose a plan to resume sending.',
      'trial_expired',
      402
    );
  }

  // KYC gate — allow a small free allowance, then require approved business verification.
  if (env.kyc.required) {
    const kycStatus = tenant.kyc?.status || 'none';
    const sentSoFar = sub.emailsSentThisPeriod ?? 0;
    if (kycStatus !== 'approved' && sentSoFar + count > env.kyc.sendLimitBeforeKyc) {
      throw new SendBlockedError(
        kycStatus === 'submitted'
          ? 'KYC is under review. Sending unlocks once approved.'
          : 'Business verification (KYC) required to keep sending. Submit PAN/GST in Settings.',
        'kyc_required'
      );
    }
  }

  // Paying tenants are limited only by their plan's monthly quota — no per-tenant daily
  // cap. The platform-wide 24h cap (enforced in loadTenantForSend) protects AWS instead.
  const quota = getEffectiveQuota(sub);
  const used = sub.emailsSentThisPeriod ?? 0;
  if (quota > 0 && used + count > quota) {
    const remaining = Math.max(0, quota - used);
    throw new SendBlockedError(
      `Monthly email limit reached (${used}/${quota}). ${remaining} remaining. Upgrade your plan or buy a quota add-on.`,
      'quota_exceeded'
    );
  }
}

/**
 * Atomically increments quota, reputation sent, and warm-up daily counter.
 * @param {string} tenantId
 * @param {number} [count=1]
 */
export async function recordSent(tenantId, count = 1) {
  await Tenant.updateOne(
    { _id: tenantId },
    {
      $inc: {
        'subscription.emailsSentThisPeriod': count,
        'reputation.sent': count,
      },
    }
  );
  // Keep the platform-wide 24h counter in lock-step with per-tenant sends.
  await recordPlatformSend(count);
}

/**
 * Records delivery/bounce/complaint and evaluates guardrails.
 * @param {string} tenantId
 * @param {string} eventType
 */
export async function recordReputationEvent(tenantId, eventType) {
  const field = {
    delivered: 'reputation.delivered',
    bounced: 'reputation.bounced',
    complaint: 'reputation.complained',
  }[eventType];

  if (!field) return null;

  const tenant = await Tenant.findOneAndUpdate(
    { _id: tenantId },
    { $inc: { [field]: 1 }, $set: { 'reputation.lastEventAt': new Date() } },
    { new: true }
  );
  if (!tenant) return null;

  return evaluateGuardrails(tenant);
}

/**
 * Warn at lower thresholds; auto-pause and restrict at higher thresholds.
 * @param {import('mongoose').Document} tenant
 */
export async function evaluateGuardrails(tenant) {
  const { bounceRate, complaintRate, sent } = reputationRates(tenant.reputation);

  // Absolute-count tripwire — fires REGARDLESS of sample size, so a brand-new
  // tenant blasting a spam-trap list (e.g. 6 complaints in its first 30 sends)
  // is paused immediately instead of getting a free pass below minSampleSize.
  const complainedCount = tenant.reputation?.complained || 0;
  const bouncedCount = tenant.reputation?.bounced || 0;
  if (
    !tenant.sending?.paused &&
    (complainedCount >= env.reputation.complaintAbsoluteLimit ||
      bouncedCount >= env.reputation.bounceAbsoluteLimit)
  ) {
    const reason =
      complainedCount >= env.reputation.complaintAbsoluteLimit
        ? `${complainedCount} complaints in the current window (limit ${env.reputation.complaintAbsoluteLimit}).`
        : `${bouncedCount} hard bounces in the current window (limit ${env.reputation.bounceAbsoluteLimit}).`;
    await Tenant.updateOne(
      { _id: tenant._id, 'sending.paused': { $ne: true } },
      {
        $set: {
          status: 'restricted',
          'sending.paused': true,
          'sending.pauseReason': `${reason} Sending auto-paused to protect platform deliverability.`,
          'sending.pauseSource': 'reputation',
          'sending.pausedAt': new Date(),
          'sending.reputationWarning': true,
        },
      }
    );
    await notifySendingAutoPaused(String(tenant._id), reason);
    return { paused: true, reason };
  }

  if (sent < env.reputation.minSampleSize) return null;

  const bounceWarn = env.reputation.bounceRateLimit * env.reputation.warnRatio;
  const complaintWarn = env.reputation.complaintRateLimit * env.reputation.warnRatio;
  const bouncePause = env.reputation.bounceRateLimit * env.reputation.pauseRatio;
  const complaintPause = env.reputation.complaintRateLimit * env.reputation.pauseRatio;

  const tenantId = String(tenant._id);

  if (!tenant.sending?.paused) {
    if (complaintRate >= complaintWarn || bounceRate >= bounceWarn) {
      await Tenant.updateOne(
        { _id: tenant._id },
        { $set: { 'sending.reputationWarning': true } }
      );
      await upsertSystemNotice({
        tenantId,
        dedupeKey: 'reputation_warning',
        title: 'Deliverability warning',
        message: `Bounce ${(bounceRate * 100).toFixed(2)}% / complaint ${(complaintRate * 100).toFixed(2)}% — clean your list before AWS limits are hit.`,
        severity: 'warning',
        category: 'sending',
        actionHref: '/dashboard/analytics',
        actionLabel: 'View analytics',
      });
    } else if (tenant.sending?.reputationWarning) {
      await Tenant.updateOne({ _id: tenant._id }, { $set: { 'sending.reputationWarning': false } });
      await deactivateSystemNotice(tenantId, 'reputation_warning');
    }
  }

  if (tenant.sending?.paused) return null;

  let reason = '';
  if (complaintRate >= complaintPause) {
    reason = `Complaint rate ${(complaintRate * 100).toFixed(2)}% exceeded threshold ${(complaintPause * 100).toFixed(2)}%.`;
  } else if (bounceRate >= bouncePause) {
    reason = `Bounce rate ${(bounceRate * 100).toFixed(2)}% exceeded threshold ${(bouncePause * 100).toFixed(2)}%.`;
  }

  if (!reason) return { warned: tenant.sending?.reputationWarning };

  await Tenant.updateOne(
    { _id: tenant._id, 'sending.paused': { $ne: true } },
    {
      $set: {
        status: 'restricted',
        'sending.paused': true,
        'sending.pauseReason': `${reason} Sending auto-paused to protect platform deliverability.`,
        'sending.pauseSource': 'reputation',
        'sending.pausedAt': new Date(),
        'sending.reputationWarning': true,
      },
    }
  );

  await notifySendingAutoPaused(tenantId, reason);
  return { paused: true, reason };
}

/**
 * Ramp warm-up daily cap after clean sending window.
 * @param {string} tenantId
 */
export async function maybeRampWarmUp(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant?.warmUp) return;

  const rates = reputationRates(tenant.reputation);
  if (rates.sent < 100 || rates.bounceRate > 0.02 || rates.complaintRate > 0.0005) return;

  const quota = getEffectiveQuota(tenant.subscription || {});
  const nextCap = Math.min(quota, Math.round((tenant.warmUp.dailyCap || 200) * 1.5));
  if (nextCap <= tenant.warmUp.dailyCap) return;

  tenant.warmUp.dailyCap = nextCap;
  tenant.warmUp.rampLevel = (tenant.warmUp.rampLevel || 0) + 1;
  await tenant.save();
}
