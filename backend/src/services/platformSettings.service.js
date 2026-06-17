import { PlatformSetting } from '../models/PlatformSetting.js';

const HALT_KEY = 'platformSendingHalted';
const LIMIT_KEY = 'platformDailySendLimit';
const USAGE_KEY = 'platformDailyUsage';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Load platform sending halt flag (DB overrides env when set).
 */
export async function isPlatformSendingHalted() {
  const row = await PlatformSetting.findOne({ key: HALT_KEY }).lean();
  if (row && typeof row.value === 'boolean') return row.value;
  const { env } = await import('../config/env.js');
  return env.platformSendingHalted;
}

/**
 * Set platform-wide sending halt (super admin kill switch).
 * @param {boolean} halted
 */
export async function setPlatformSendingHalted(halted) {
  await PlatformSetting.findOneAndUpdate(
    { key: HALT_KEY },
    { $set: { value: Boolean(halted) } },
    { upsert: true, new: true }
  );
}

/**
 * Admin-configured platform-wide 24h total send limit (DB overrides env default).
 * 0 = unlimited.
 */
export async function getPlatformDailyLimit() {
  const row = await PlatformSetting.findOne({ key: LIMIT_KEY }).lean();
  if (row && typeof row.value === 'number' && row.value >= 0) return row.value;
  const { env } = await import('../config/env.js');
  return env.platformDailySendLimit;
}

/**
 * Super-admin: set the platform-wide 24h send limit (total across all tenants).
 * @param {number} limit emails per rolling 24h (0 = unlimited)
 */
export async function setPlatformDailyLimit(limit) {
  const n = Math.max(0, Math.floor(Number(limit) || 0));
  await PlatformSetting.findOneAndUpdate(
    { key: LIMIT_KEY },
    { $set: { value: n } },
    { upsert: true, new: true }
  );
  return n;
}

/**
 * Current platform-wide usage in the rolling 24h window (lazy rollover).
 * @returns {Promise<{ count: number, limit: number, remaining: number | null, windowStart: string | null, exceeded: boolean }>}
 */
export async function getPlatformDailyUsage() {
  const now = Date.now();
  const [row, limit] = await Promise.all([
    PlatformSetting.findOne({ key: USAGE_KEY }).lean(),
    getPlatformDailyLimit(),
  ]);

  let count = Number(row?.value?.count) || 0;
  let windowStart = row?.value?.windowStart || null;
  // Window rolled over — report a fresh window (DB is reset lazily on next send).
  if (windowStart && now - new Date(windowStart).getTime() >= DAY_MS) {
    count = 0;
    windowStart = null;
  }

  const remaining = limit > 0 ? Math.max(0, limit - count) : null;
  return { count, limit, remaining, windowStart, exceeded: limit > 0 && count >= limit };
}

/**
 * Increment the platform-wide 24h send counter, rolling the window over when elapsed.
 * @param {number} [count=1]
 */
export async function recordPlatformSend(count = 1) {
  const now = Date.now();
  const row = await PlatformSetting.findOne({ key: USAGE_KEY }).lean();
  const windowStart = row?.value?.windowStart ? new Date(row.value.windowStart).getTime() : 0;

  if (!row || !windowStart || now - windowStart >= DAY_MS) {
    await PlatformSetting.findOneAndUpdate(
      { key: USAGE_KEY },
      { $set: { value: { count, windowStart: new Date(now).toISOString() } } },
      { upsert: true }
    );
    return count;
  }

  const updated = await PlatformSetting.findOneAndUpdate(
    { key: USAGE_KEY },
    { $inc: { 'value.count': count } },
    { new: true }
  );
  return Number(updated?.value?.count) || count;
}
