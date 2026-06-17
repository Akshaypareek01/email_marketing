import { EmailEvent } from '../models/EmailEvent.js';
import { Campaign } from '../models/Campaign.js';
import { Contact } from '../models/Contact.js';
import { loadTenantForSend, reputationRates } from '../services/sendingGuard.service.js';
import { getEffectiveQuota } from '../services/subscription.service.js';

/**
 * Tenant analytics aggregates for dashboard charts (Phase 3 partial).
 */
export async function getAccountAnalytics(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await loadTenantForSend(tenantId);
    const rates = reputationRates(tenant.reputation);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [events, campaigns, contacts] = await Promise.all([
      EmailEvent.find({ tenantId, createdAt: { $gte: since } }).select('eventType createdAt').lean(),
      Campaign.find({ tenantId }).select('name status stats createdAt').sort({ createdAt: -1 }).limit(10).lean(),
      Contact.countDocuments({ tenantId }),
    ]);

    const byType = { sent: 0, delivered: 0, bounced: 0, soft_bounced: 0, complaint: 0, rejected: 0, opened: 0, clicked: 0 };
    const byDay = {};

    events.forEach((ev) => {
      if (byType[ev.eventType] != null) byType[ev.eventType]++;
      const day = new Date(ev.createdAt).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });

    const sendVolume = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({
      reputation: {
        sent: rates.sent,
        bounceRate: Math.round(rates.bounceRate * 10000) / 100,
        complaintRate: Math.round(rates.complaintRate * 10000) / 100,
      },
      events: byType,
      sendVolume,
      topCampaigns: campaigns,
      contacts,
      quota: {
        used: tenant.subscription?.emailsSentThisPeriod ?? 0,
        total: getEffectiveQuota(tenant.subscription || {}),
        base: tenant.subscription?.monthlyEmailQuota ?? 0,
        bonus: tenant.subscription?.quotaBonusThisPeriod ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
}
