import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { Domain } from '../models/Domain.js';
import { Plan } from '../models/Plan.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { env } from '../config/env.js';
import { reputationRates } from '../services/sendingGuard.service.js';
import { getSesAccount } from '../services/ses.service.js';
import { getPlatformProtectState } from '../services/platformReputationGuard.service.js';
import { upsertSystemNotice, deactivateSystemNotice } from '../services/systemNotice.service.js';
import { isPlatformSendingHalted } from '../services/platformSettings.service.js';
import logger from '../middleware/logsCreate.js';

/** AWS SES standard outbound pricing (USD per 1,000 emails) — for cost estimation. */
const SES_COST_PER_1000_USD = 0.1;

/**
 * Super-admin: platform-wide overview metrics for the dashboard.
 * SES reputation aggregates are placeholders until the event pipeline lands.
 */
export async function getOverview(req, res, next) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      tenantCount,
      activeTenants,
      suspendedTenants,
      pausedTenants,
      userCount,
      domainCount,
      planCount,
      dailySent,
      monthToDateSent,
      repAgg,
    ] = await Promise.all([
      Tenant.countDocuments(),
      Tenant.countDocuments({ status: 'active' }),
      Tenant.countDocuments({ status: 'suspended' }),
      Tenant.countDocuments({ 'sending.paused': true }),
      User.countDocuments(),
      Domain.countDocuments(),
      Plan.countDocuments({ isActive: true }),
      EmailEvent.countDocuments({ eventType: 'sent', timestamp: { $gte: startOfDay } }),
      EmailEvent.countDocuments({ eventType: 'sent', timestamp: { $gte: monthStart } }),
      Tenant.aggregate([
        {
          $group: {
            _id: null,
            sent: { $sum: '$reputation.sent' },
            bounced: { $sum: '$reputation.bounced' },
            complained: { $sum: '$reputation.complained' },
          },
        },
      ]),
    ]);

    // AWS account quota/rate (best-effort — never let an AWS error break the overview).
    let sesAccount = null;
    try {
      sesAccount = await getSesAccount();
    } catch (err) {
      logger.warn({ tag: 'ses-account', message: 'GetAccount failed', error: err.message });
    }
    const estimatedCostUsd = Math.round((monthToDateSent / 1000) * SES_COST_PER_1000_USD * 100) / 100;

    const agg = repAgg[0] || { sent: 0, bounced: 0, complained: 0 };
    const rates = reputationRates(agg);
    const pct = (n) => Math.round(n * 10000) / 100;
    const platformHalted = await isPlatformSendingHalted();
    const platformProtect = await getPlatformProtectState();

    res.json({
      tenants: {
        total: tenantCount,
        active: activeTenants,
        suspended: suspendedTenants,
        paused: pausedTenants,
      },
      users: userCount,
      domains: domainCount,
      plans: planCount,
      ses: {
        // Account-wide rolling-window rates derived from per-tenant counters.
        bounceRate: rates.sent ? pct(rates.bounceRate) : null,
        complaintRate: rates.sent ? pct(rates.complaintRate) : null,
        dailySent,
        // AWS account 24h send cap (null when AWS creds/GetAccount unavailable).
        sendQuota: sesAccount?.max24HourSend ?? null,
        windowSent: rates.sent,
        platformHalted,
        limits: {
          bounceRate: pct(env.reputation.bounceRateLimit),
          complaintRate: pct(env.reputation.complaintRateLimit),
        },
        platformProtect,
        // Live AWS account quota/rate/status (from SES GetAccount).
        account: sesAccount,
        // Month-to-date outbound volume + estimated AWS SES cost.
        usage: {
          monthToDateSent,
          estimatedCostUsd,
          costPer1000Usd: SES_COST_PER_1000_USD,
          currency: 'USD',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: list tenants with search + pagination. */
export async function listTenants(req, res, next) {
  try {
    const { q = '', status, page = 1, limit = 25 } = req.query;
    const filter = {};
    if (q) filter.name = { $regex: String(q), $options: 'i' };
    if (status) filter.status = status;

    const pageNum = Math.max(1, Number(page));
    const lim = Math.min(100, Math.max(1, Number(limit)));

    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * lim)
        .limit(lim)
        .lean(),
      Tenant.countDocuments(filter),
    ]);

    res.json({ tenants, total, page: pageNum, limit: lim });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: single tenant detail (with owner + domains). */
export async function getTenant(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const [users, domains] = await Promise.all([
      User.find({ tenantId: tenant._id }).select('name email role createdAt').lean(),
      Domain.find({ tenantId: tenant._id }).select('name status createdAt').lean(),
    ]);

    const rates = reputationRates(tenant.reputation);
    const reputation = {
      ...tenant.reputation,
      bounceRate: Math.round(rates.bounceRate * 10000) / 100,
      complaintRate: Math.round(rates.complaintRate * 10000) / 100,
    };

    res.json({ tenant, users, domains, reputation });
  } catch (err) {
    next(err);
  }
}

/** Super-admin: change tenant status (suspend / restrict / reactivate). */
export async function setTenantStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['active', 'suspended'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
    }
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    if (status === 'suspended') {
      await upsertSystemNotice({
        tenantId: tenant._id,
        dedupeKey: 'account_suspended',
        title: 'Account suspended',
        message: 'Your account has been suspended by an operator. Contact support for assistance.',
        severity: 'danger',
        category: 'account',
        actionHref: '/dashboard/support',
        actionLabel: 'Contact support',
      });
    } else {
      await deactivateSystemNotice(String(tenant._id), 'account_suspended');
    }

    res.json({ tenant });
  } catch (err) {
    next(err);
  }
}

/**
 * Super-admin: manually pause or resume a tenant's sending.
 * Resuming clears an auto-pause; pausing records the operator as the source.
 */
export async function setTenantSending(req, res, next) {
  try {
    const { paused, reason = '' } = req.body;
    if (typeof paused !== 'boolean') {
      return res.status(400).json({ message: 'paused must be a boolean' });
    }

    const update = paused
      ? {
          'sending.paused': true,
          'sending.pauseReason': reason || 'Sending paused by an operator.',
          'sending.pauseSource': 'manual',
          'sending.pausedAt': new Date(),
        }
      : {
          'sending.paused': false,
          'sending.pauseReason': '',
          'sending.pauseSource': '',
          'sending.pausedAt': null,
        };

    const extra = {};
    if (!paused) {
      extra.status = 'active';
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { ...update, ...extra } },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    if (paused) {
      await upsertSystemNotice({
        tenantId: tenant._id,
        dedupeKey: 'sending_paused',
        title: 'Sending paused',
        message: reason || 'Sending paused by an operator.',
        severity: 'danger',
        category: 'sending',
        actionHref: '/dashboard/support',
        actionLabel: 'Contact support',
      });
    } else {
      await deactivateSystemNotice(String(tenant._id), 'sending_paused');
    }

    res.json({ tenant });
  } catch (err) {
    next(err);
  }
}

/**
 * Super-admin: manually adjust tenant monthly email quota.
 */
export async function adjustTenantQuota(req, res, next) {
  try {
    const { monthlyEmailQuota } = req.body;
    if (monthlyEmailQuota == null || Number(monthlyEmailQuota) < 0) {
      return res.status(400).json({ message: 'monthlyEmailQuota must be a non-negative number' });
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { 'subscription.monthlyEmailQuota': Number(monthlyEmailQuota) } },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    res.json({ tenant });
  } catch (err) {
    next(err);
  }
}
