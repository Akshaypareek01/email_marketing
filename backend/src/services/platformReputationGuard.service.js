import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { PlatformSetting } from '../models/PlatformSetting.js';
import { reputationRates } from './sendingGuard.service.js';
import { notifySendingAutoPaused } from './systemNotice.service.js';
import { isPlatformSendingHalted } from './platformSettings.service.js';
import { writeAuditLog } from './audit.service.js';
import logger from '../middleware/logsCreate.js';

const PROTECT_STATE_KEY = 'platformReputationProtect';

/**
 * Aggregate platform-wide reputation from per-tenant rolling counters.
 * @returns {Promise<{ sent: number; bounced: number; complained: number; bounceRate: number; complaintRate: number }>}
 */
export async function aggregatePlatformReputation() {
  const [repAgg] = await Tenant.aggregate([
    {
      $group: {
        _id: null,
        sent: { $sum: '$reputation.sent' },
        bounced: { $sum: '$reputation.bounced' },
        complained: { $sum: '$reputation.complained' },
      },
    },
  ]);

  return reputationRates(repAgg || { sent: 0, bounced: 0, complained: 0 });
}

/**
 * Risk score for platform protect ranking — complaints weighted higher than bounces.
 * @param {import('../models/Tenant.js').Tenant} tenant
 * @returns {number}
 */
export function computeTenantRiskScore(tenant) {
  const rates = reputationRates(tenant.reputation);
  if (rates.sent < env.reputation.minSampleSize) return 0;

  const bounceScore = rates.bounceRate / env.reputation.bounceRateLimit;
  const complaintScore = rates.complaintRate / env.reputation.complaintRateLimit;
  return complaintScore * 5 + bounceScore;
}

/**
 * Load persisted platform protect evaluation state.
 */
export async function getPlatformProtectState() {
  const row = await PlatformSetting.findOne({ key: PROTECT_STATE_KEY }).lean();
  return row?.value && typeof row.value === 'object' ? row.value : null;
}

/**
 * @param {Record<string, unknown>} value
 */
async function savePlatformProtectState(value) {
  await PlatformSetting.findOneAndUpdate(
    { key: PROTECT_STATE_KEY },
    { $set: { value } },
    { upsert: true, new: true }
  );
}

/**
 * Auto-pause a tenant to protect the shared SES account (PRD §6.4).
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 * @param {string} reason
 * @param {Record<string, unknown>} metadata
 */
async function pauseTenantForPlatformProtect(tenantId, reason, metadata) {
  const updated = await Tenant.findOneAndUpdate(
    { _id: tenantId, 'sending.paused': { $ne: true } },
    {
      $set: {
        status: 'restricted',
        'sending.paused': true,
        'sending.pauseReason': reason,
        'sending.pauseSource': 'platform_protect',
        'sending.pausedAt': new Date(),
        'sending.reputationWarning': true,
      },
    },
    { new: true }
  );

  if (!updated) return null;

  await notifySendingAutoPaused(String(tenantId), reason);
  await writeAuditLog({
    action: 'platform.auto_pause_tenant',
    tenantId: String(tenantId),
    targetType: 'tenant',
    targetId: String(tenantId),
    actorRole: 'system',
    metadata,
  });

  logger.warn({
    tag: 'platform-protect',
    tenantId: String(tenantId),
    message: 'Auto-paused tenant to protect platform SES reputation',
    metadata,
  });

  return updated;
}

/**
 * Rank tenants by deliverability risk for admin visibility.
 * @param {number} [limit]
 */
export async function listTenantRiskRanking(limit = 25) {
  const tenants = await Tenant.find({
    'reputation.sent': { $gte: env.reputation.minSampleSize },
  })
    .select('name slug status sending reputation createdAt')
    .lean();

  const lim = Math.min(Math.max(1, limit), 100);

  return tenants
    .map((tenant) => {
      const rates = reputationRates(tenant.reputation);
      return {
        tenantId: String(tenant._id),
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        sendingPaused: Boolean(tenant.sending?.paused),
        pauseSource: tenant.sending?.pauseSource || '',
        sent: rates.sent,
        bounceRate: Math.round(rates.bounceRate * 10000) / 100,
        complaintRate: Math.round(rates.complaintRate * 10000) / 100,
        riskScore: Math.round(computeTenantRiskScore(tenant) * 1000) / 1000,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, lim);
}

/**
 * When platform aggregate bounce/complaint nears AWS limits, pause highest-risk senders first.
 * Reversible by super admin via tenant sending resume.
 */
export async function evaluatePlatformReputationGuard() {
  if (await isPlatformSendingHalted()) {
    return { skipped: 'platform_halted' };
  }

  const rates = await aggregatePlatformReputation();
  const minSample = env.reputation.platformMinSampleSize;

  if (rates.sent < minSample) {
    await savePlatformProtectState({
      active: false,
      lastEvaluatedAt: new Date().toISOString(),
      windowSent: rates.sent,
      minSampleRequired: minSample,
    });
    return { action: 'none', reason: 'insufficient_platform_sample', rates, windowSent: rates.sent };
  }

  const bounceRatio = rates.bounceRate / env.reputation.bounceRateLimit;
  const complaintRatio = rates.complaintRate / env.reputation.complaintRateLimit;
  const severityRatio = Math.max(bounceRatio, complaintRatio);
  const triggerRatio = env.reputation.platformProtectRatio;

  const pct = (n) => Math.round(n * 10000) / 100;
  const platformSnapshot = {
    bounceRate: pct(rates.bounceRate),
    complaintRate: pct(rates.complaintRate),
    windowSent: rates.sent,
    severityRatio: Math.round(severityRatio * 1000) / 1000,
    triggerRatio,
  };

  if (severityRatio < triggerRatio) {
    await savePlatformProtectState({
      active: false,
      lastEvaluatedAt: new Date().toISOString(),
      ...platformSnapshot,
    });
    return { action: 'none', reason: 'within_safe_threshold', rates: platformSnapshot };
  }

  const tenants = await Tenant.find({
    'sending.paused': { $ne: true },
    status: { $in: ['active', 'restricted'] },
    'reputation.sent': { $gte: env.reputation.minSampleSize },
  })
    .select('name slug reputation sending status')
    .lean();

  const ranked = tenants
    .map((tenant) => ({ tenant, score: computeTenantRiskScore(tenant) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    await savePlatformProtectState({
      active: true,
      lastEvaluatedAt: new Date().toISOString(),
      ...platformSnapshot,
      pausedTenantIds: [],
    });
    return { action: 'none', reason: 'no_eligible_tenants', rates: platformSnapshot };
  }

  const maxPauses = env.reputation.platformMaxAutoPausesPerRun;
  const pausedTenantIds = [];
  const reason = `Platform bounce ${platformSnapshot.bounceRate}% / complaint ${platformSnapshot.complaintRate}% approaching AWS limits.`;

  for (const { tenant, score } of ranked.slice(0, maxPauses)) {
    const paused = await pauseTenantForPlatformProtect(tenant._id, reason, {
      ...platformSnapshot,
      tenantRiskScore: score,
      tenantBounceRate: pct(reputationRates(tenant.reputation).bounceRate),
      tenantComplaintRate: pct(reputationRates(tenant.reputation).complaintRate),
    });
    if (paused) pausedTenantIds.push(String(tenant._id));
  }

  await savePlatformProtectState({
    active: true,
    lastEvaluatedAt: new Date().toISOString(),
    lastPausedAt: new Date().toISOString(),
    ...platformSnapshot,
    pausedTenantIds,
  });

  await writeAuditLog({
    action: 'platform.reputation_guard',
    actorRole: 'system',
    metadata: { ...platformSnapshot, pausedTenantIds, pausedCount: pausedTenantIds.length },
  });

  return {
    action: pausedTenantIds.length ? 'paused' : 'none',
    pausedCount: pausedTenantIds.length,
    pausedTenantIds,
    rates: platformSnapshot,
  };
}
