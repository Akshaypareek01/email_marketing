import { Campaign } from '../models/Campaign.js';
import { Template } from '../models/Template.js';
import { ContactList } from '../models/ContactList.js';
import { Contact } from '../models/Contact.js';
import { Domain } from '../models/Domain.js';
import { hasUnsubscribeFooter } from '../services/contactsImport.service.js';
import { loadTenantForSend } from '../services/sendingGuard.service.js';
import { getEffectiveQuota } from '../services/subscription.service.js';
import { analyzeListHygiene } from '../services/listHygiene.service.js';
import { queueCampaignAt } from '../services/scheduledCampaign.service.js';
import { assertEmailVerified } from '../services/emailVerification.service.js';

/**
 * Run pre-flight checks for a campaign (PRD §5.7).
 * @param {import('mongoose').Types.ObjectId} tenantId
 * @param {{ templateId: string, listId: string }} params
 */
async function runPreflight(tenantId, { templateId, listId }) {
  const notes = [];
  let ok = true;

  const [template, list, activeDomain, tenant, recipientCount] = await Promise.all([
    Template.findOne({ _id: templateId, tenantId }),
    ContactList.findOne({ _id: listId, tenantId }),
    Domain.findOne({ tenantId, verifiedForSending: true }),
    loadTenantForSend(tenantId),
    Contact.countDocuments({ tenantId, listIds: listId, status: 'subscribed' }),
  ]);

  if (!template) {
    notes.push('Template not found');
    ok = false;
  } else if (!hasUnsubscribeFooter(template.htmlBody)) {
    notes.push('Template must include unsubscribe link or {{unsubscribe_url}} merge tag');
    ok = false;
  }

  if (!list) {
    notes.push('Contact list not found');
    ok = false;
  } else if (recipientCount === 0) {
    notes.push('List has no subscribed contacts');
    ok = false;
  }

  if (!activeDomain) {
    notes.push('No verified domain — verify a domain before sending campaigns');
    ok = false;
  }

  const quota = getEffectiveQuota(tenant.subscription || {});
  const used = tenant.subscription?.emailsSentThisPeriod ?? 0;
  const remaining = quota > 0 ? Math.max(0, quota - used) : null;

  if (remaining != null && recipientCount > remaining) {
    notes.push(`Insufficient quota: ${recipientCount} recipients but only ${remaining} emails remaining`);
    ok = false;
  }

  if (tenant.sending?.paused) {
    notes.push(`Sending paused: ${tenant.sending.pauseReason || 'contact support'}`);
    ok = false;
  }

  const hygiene = await analyzeListHygiene(tenantId, listId);
  if (!hygiene.ok) {
    notes.push(...hygiene.notes);
    ok = false;
  } else if (hygiene.notes.length) {
    notes.push(...hygiene.notes);
  }

  return { ok, notes, recipientCount, remaining, hygiene };
}

export async function listCampaigns(req, res, next) {
  try {
    const campaigns = await Campaign.find({ tenantId: req.user.tenantId })
      .populate('templateId', 'name')
      .populate('listId', 'name')
      .sort({ createdAt: -1 });
    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, tenantId: req.user.tenantId })
      .populate('templateId', 'name subject')
      .populate('listId', 'name');
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
}

export async function createCampaign(req, res, next) {
  try {
    const preflight = await runPreflight(req.user.tenantId, {
      templateId: req.body.templateId,
      listId: req.body.listId,
    });

    const campaign = await Campaign.create({
      tenantId: req.user.tenantId,
      name: req.body.name.trim(),
      subject: req.body.subject.trim(),
      templateId: req.body.templateId,
      listId: req.body.listId,
      fromMailboxId: req.body.fromMailboxId || null,
      status: 'draft',
      scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 5) : [],
      stats: { total: preflight.recipientCount },
      preflightNotes: preflight.notes,
    });

    res.status(201).json({ campaign, preflight });
  } catch (err) {
    next(err);
  }
}

export async function preflightCampaign(req, res, next) {
  try {
    const preflight = await runPreflight(req.user.tenantId, {
      templateId: req.body.templateId,
      listId: req.body.listId,
    });
    res.json(preflight);
  } catch (err) {
    next(err);
  }
}

/**
 * Queue campaign send — seeds recipients and enqueues BullMQ jobs (or in-process fallback).
 */
export async function scheduleCampaign(req, res, next) {
  try {
    assertEmailVerified(req.user);

    const campaign = await Campaign.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });

    if (campaign.status === 'sending') {
      return res.status(409).json({ message: 'Campaign is already sending' });
    }

    const preflight = await runPreflight(req.user.tenantId, {
      templateId: campaign.templateId,
      listId: campaign.listId,
    });

    campaign.preflightNotes = preflight.notes;

    if (!preflight.ok) {
      await campaign.save();
      return res.status(422).json({ message: 'Pre-flight checks failed', preflight, campaign });
    }

    await seedCampaignRecipients(campaign);

    const sendNow = req.body.sendNow !== false && !req.body.scheduledAt;
    const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date();

    if (!sendNow && scheduledAt.getTime() > Date.now()) {
      const queued = await queueCampaignAt(campaign, scheduledAt);
      return res.json({
        campaign,
        message: `Campaign scheduled for ${scheduledAt.toISOString()}`,
        schedule: queued,
      });
    }

    campaign.status = 'scheduled';
    campaign.scheduledAt = scheduledAt;
    await campaign.save();

    const { startCampaignSend } = await import('../services/campaignSend.service.js');
    await startCampaignSend(campaign._id);

    res.json({
      campaign,
      message:
        'Campaign send started. Delivery is throttled via BullMQ when REDIS_URL is set, otherwise in-process.',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaign(req, res, next) {
  try {
    const campaign = await Campaign.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (campaign.status === 'sending') {
      return res.status(409).json({ message: 'Cannot delete a campaign that is sending' });
    }
    await campaign.deleteOne();
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
}
