import { Tenant } from '../models/Tenant.js';
import { Domain } from '../models/Domain.js';
import { Mailbox } from '../models/Mailbox.js';
import { Plan } from '../models/Plan.js';
import { Contact } from '../models/Contact.js';
import { Campaign } from '../models/Campaign.js';
import { loadTenantForSend, reputationRates } from '../services/sendingGuard.service.js';
import { getEffectiveQuota } from '../services/subscription.service.js';
import { getTrialEndsAt, isTrialExpired, trialDaysLeft } from '../services/planLimits.service.js';
import { syncDerivedNotices } from '../services/systemNotice.service.js';
import { env } from '../config/env.js';

/**
 * Tenant-facing account overview: subscription, quota usage, sending state, and resource counts.
 * Uses loadTenantForSend so the quota period / reputation window are rolled over before we read them.
 */
export async function getAccountOverview(req, res, next) {
  try {
    const tenant = await loadTenantForSend(req.user.tenantId);
    await syncDerivedNotices(tenant);

    const [domainCount, activeDomains, mailboxCount, contactCount, campaignCount, plan] = await Promise.all([
      Domain.countDocuments({ tenantId: tenant._id }),
      Domain.countDocuments({ tenantId: tenant._id, verifiedForSending: true }),
      Mailbox.countDocuments({ tenantId: tenant._id }),
      Contact.countDocuments({ tenantId: tenant._id }),
      Campaign.countDocuments({ tenantId: tenant._id, status: { $in: ['sent', 'sending'] } }),
      tenant.subscription?.planId ? Plan.findById(tenant.subscription.planId).lean() : null,
    ]);

    const sub = tenant.subscription || {};
    const baseQuota = sub.monthlyEmailQuota ?? 0;
    const bonus = sub.quotaBonusThisPeriod ?? 0;
    const quota = getEffectiveQuota(sub);
    const used = sub.emailsSentThisPeriod ?? 0;
    const rates = reputationRates(tenant.reputation);

    res.json({
      tenant: { id: tenant._id, name: tenant.name, status: tenant.status },
      subscription: {
        status: sub.status,
        planId: sub.planId,
        planName: plan?.name || null,
        monthlyEmailQuota: quota,
        baseMonthlyQuota: baseQuota,
        quotaBonusThisPeriod: bonus,
        emailsSentThisPeriod: used,
        remaining: quota > 0 ? Math.max(0, quota - used) : null,
        usedPct: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0,
        periodStart: sub.periodStart,
        maxDomains: sub.maxDomains ?? 0,
        maxContacts: sub.maxContacts ?? 0,
        maxTeamUsers: sub.maxTeamUsers ?? 0,
        trialEndsAt: sub.status === 'trialing' ? getTrialEndsAt(tenant) : null,
        trialExpired: isTrialExpired(tenant),
        trialDaysLeft: trialDaysLeft(tenant),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
        canceledAt: sub.canceledAt || null,
        periodResetAt: (() => {
          const d = new Date(sub.periodStart || Date.now());
          d.setMonth(d.getMonth() + 1);
          return d;
        })(),
      },
      sending: {
        paused: tenant.sending?.paused || false,
        pauseReason: tenant.sending?.pauseReason || '',
        pauseSource: tenant.sending?.pauseSource || '',
      },
      reputation: {
        sent: rates.sent,
        bounceRate: Math.round(rates.bounceRate * 10000) / 100,
        complaintRate: Math.round(rates.complaintRate * 10000) / 100,
      },
      resources: {
        domains: domainCount,
        activeDomains,
        mailboxes: mailboxCount,
        contacts: contactCount,
        campaignsSent: campaignCount,
      },
      features: {
        inboundEmailEnabled: env.inboundEmailEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
}
