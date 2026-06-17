import {
  isPlatformSendingHalted,
  setPlatformSendingHalted,
  getPlatformDailyLimit,
  setPlatformDailyLimit,
  getPlatformDailyUsage,
} from '../services/platformSettings.service.js';
import {
  getPlatformProtectState,
  listTenantRiskRanking,
} from '../services/platformReputationGuard.service.js';
import { runPlatformReputationGuard } from '../jobs/platformReputation.job.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

/**
 * Get platform kill-switch state and auto-protect status.
 */
export async function getPlatformSettings(req, res, next) {
  try {
    const [halted, platformProtect, dailyLimit, dailyUsage] = await Promise.all([
      isPlatformSendingHalted(),
      getPlatformProtectState(),
      getPlatformDailyLimit(),
      getPlatformDailyUsage(),
    ]);
    res.json({ platformSendingHalted: halted, platformProtect, dailyLimit, dailyUsage });
  } catch (err) {
    next(err);
  }
}

/**
 * Set the platform-wide 24h send limit (total across all tenants). 0 = unlimited.
 */
export async function setPlatformDailyLimitHandler(req, res, next) {
  try {
    const { limit } = req.body;
    if (limit == null || Number(limit) < 0 || !Number.isFinite(Number(limit))) {
      return res.status(400).json({ message: 'limit must be a non-negative number (0 = unlimited)' });
    }
    const dailyLimit = await setPlatformDailyLimit(limit);
    await writeAuditLog({
      ...auditContext(req),
      action: 'admin.platform_daily_limit',
      metadata: { dailyLimit },
    });
    const dailyUsage = await getPlatformDailyUsage();
    res.json({ dailyLimit, dailyUsage });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle platform-wide sending halt.
 */
export async function setPlatformHalt(req, res, next) {
  try {
    const { halted } = req.body;
    if (typeof halted !== 'boolean') {
      return res.status(400).json({ message: 'halted must be a boolean' });
    }
    await setPlatformSendingHalted(halted);
    await writeAuditLog({
      ...auditContext(req),
      action: 'admin.platform_halt',
      metadata: { halted },
    });
    res.json({ platformSendingHalted: halted });
  } catch (err) {
    next(err);
  }
}

/**
 * Per-tenant risk ranking for SES health dashboard (PRD §5.11 / §6.4).
 */
export async function getReputationRisk(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const [ranking, platformProtect] = await Promise.all([
      listTenantRiskRanking(limit),
      getPlatformProtectState(),
    ]);
    res.json({ ranking, platformProtect });
  } catch (err) {
    next(err);
  }
}

/**
 * Manually trigger platform reputation guard evaluation.
 */
export async function runReputationGuard(req, res, next) {
  try {
    const result = await runPlatformReputationGuard();
    await writeAuditLog({
      ...auditContext(req),
      action: 'admin.run_platform_reputation_guard',
      metadata: result,
    });
    res.json({ result });
  } catch (err) {
    next(err);
  }
}
