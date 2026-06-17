import crypto from 'crypto';
import { UnrecoverableError } from 'bullmq';
import { Campaign } from '../models/Campaign.js';
import { CampaignRecipient } from '../models/CampaignRecipient.js';
import { Contact } from '../models/Contact.js';
import { Template } from '../models/Template.js';
import { Mailbox } from '../models/Mailbox.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { env } from '../config/env.js';
import { sendEmail } from './ses.service.js';
import { isSuppressed } from './suppression.service.js';
import {
  assertCanSend,
  loadTenantForSend,
  recordSent,
  SendBlockedError,
} from './sendingGuard.service.js';
import {
  contactMergeVars,
  buildUnsubscribeUrl,
  buildUnsubscribePageUrl,
  renderMergeTags,
} from './templateRender.service.js';
import { getTenantConfigSetName } from './sesConfigSet.service.js';
import { enqueueCampaignRecipientJobs } from '../queue/campaignSend.queue.js';
import logger from '../middleware/logsCreate.js';

/** Campaign IDs currently being processed in-process (no Redis). */
const activeCampaigns = new Set();

/**
 * Create pending recipient rows for all subscribed contacts on a list.
 * @param {import('mongoose').Document} campaign
 */
export async function seedCampaignRecipients(campaign) {
  const contacts = await Contact.find({
    tenantId: campaign.tenantId,
    listIds: campaign.listId,
    status: 'subscribed',
  }).lean();

  const ops = contacts.map((c) => ({
    updateOne: {
      filter: { campaignId: campaign._id, email: c.email },
      update: {
        $setOnInsert: {
          campaignId: campaign._id,
          tenantId: campaign.tenantId,
          contactId: c._id,
          email: c.email,
          status: 'pending',
        },
      },
      upsert: true,
    },
  }));

  if (ops.length) await CampaignRecipient.bulkWrite(ops);

  campaign.stats.total = contacts.length;
  await campaign.save();

  return contacts.length;
}

/**
 * Resolve sending mailbox for a campaign.
 * @param {import('mongoose').Document} campaign
 */
async function resolveFromMailbox(campaign) {
  if (campaign.fromMailboxId) {
    const mb = await Mailbox.findOne({ _id: campaign.fromMailboxId, tenantId: campaign.tenantId });
    if (mb) return mb;
  }
  return Mailbox.findOne({ tenantId: campaign.tenantId }).sort({ createdAt: 1 });
}

/**
 * Mark campaign complete when no pending recipients remain.
 * @param {string} campaignId
 */
export async function maybeFinalizeCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign || campaign.status !== 'sending') return;

  const pending = await CampaignRecipient.countDocuments({ campaignId, status: 'pending' });
  if (pending > 0) return;

  campaign.status = 'sent';
  campaign.sentAt = new Date();
  await campaign.save();
}

/**
 * Send one campaign recipient (used by BullMQ worker and in-process fallback).
 * @param {string} campaignId
 * @param {string} recipientId
 */
export async function sendCampaignRecipient(campaignId, recipientId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return { skipped: true, reason: 'campaign_not_found' };
  if (campaign.status === 'failed') return { skipped: true, reason: 'campaign_failed' };

  const recipient = await CampaignRecipient.findOne({ _id: recipientId, campaignId });
  if (!recipient || recipient.status !== 'pending') {
    return { skipped: true, reason: 'recipient_not_pending' };
  }

  if (campaign.status !== 'sending') {
    campaign.status = 'sending';
    await campaign.save();
  }

  const [template, mailbox, configSetName] = await Promise.all([
    Template.findById(campaign.templateId),
    resolveFromMailbox(campaign),
    getTenantConfigSetName(campaign.tenantId),
  ]);

  if (!template || !mailbox) {
    campaign.status = 'failed';
    campaign.preflightNotes = [
      ...(campaign.preflightNotes || []),
      !template ? 'Template missing' : 'No mailbox available',
    ];
    await campaign.save();
    throw new UnrecoverableError(!template ? 'Template missing' : 'No mailbox available');
  }

  try {
    const tenant = await loadTenantForSend(campaign.tenantId);
    assertCanSend(tenant, 1);

    if (await isSuppressed(recipient.email, campaign.tenantId)) {
      recipient.status = 'skipped';
      recipient.error = 'Suppressed';
      await recipient.save();
      await maybeFinalizeCampaign(campaignId);
      return { skipped: true, reason: 'suppressed' };
    }

    const contact = recipient.contactId
      ? await Contact.findById(recipient.contactId).lean()
      : { email: recipient.email };

    const unsubApiUrl = buildUnsubscribeUrl(env.appUrl, recipient.email, campaign.tenantId);
    const unsubPageUrl = buildUnsubscribePageUrl(recipient.email, campaign.tenantId);
    const vars = contactMergeVars(contact, unsubPageUrl);
    const html = renderMergeTags(template.htmlBody, vars);
    const subject = renderMergeTags(campaign.subject || template.subject, vars);
    const rfcMessageId = `${crypto.randomUUID()}@${mailbox.address.split('@')[1] || 'mail'}`;

    const result = await sendEmail({
      from: mailbox.address,
      to: recipient.email,
      subject,
      html,
      rfcMessageId,
      tenantId: String(campaign.tenantId),
      campaignId: String(campaign._id),
      listUnsubscribe: unsubApiUrl,
      configurationSetName: configSetName,
      attachments: (campaign.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
    });

    await recordSent(campaign.tenantId, 1);

    await EmailEvent.create({
      tenantId: campaign.tenantId,
      messageId: result.messageId,
      eventType: 'sent',
      payload: { campaignId: campaign._id, to: recipient.email },
    });

    recipient.status = 'sent';
    recipient.sesMessageId = result.messageId;
    await recipient.save();

    await Campaign.updateOne({ _id: campaign._id }, { $inc: { 'stats.sent': 1 } });
    await maybeFinalizeCampaign(campaignId);

    return { sent: true, messageId: result.messageId };
  } catch (err) {
    recipient.status = 'failed';
    recipient.error = err instanceof SendBlockedError ? err.message : err.message || 'Send failed';
    await recipient.save();

    if (err instanceof SendBlockedError) {
      campaign.status = 'failed';
      campaign.preflightNotes = [...(campaign.preflightNotes || []), err.message];
      await campaign.save();
      throw new UnrecoverableError(err.message);
    }

    throw err;
  }
}

/**
 * Start campaign delivery — BullMQ when Redis is configured, else in-process throttle.
 * @param {string} campaignId
 */
export async function startCampaignSend(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  campaign.status = 'sending';
  await campaign.save();

  const queued = await enqueueCampaignRecipientJobs(campaignId);

  if (queued.mode === 'queue') {
    if (queued.enqueued === 0) {
      campaign.status = 'sent';
      campaign.sentAt = new Date();
      await campaign.save();
    }
    return { started: true, mode: 'queue', enqueued: queued.enqueued };
  }

  if (activeCampaigns.has(String(campaignId))) {
    return { alreadyRunning: true, mode: 'inline' };
  }

  activeCampaigns.add(String(campaignId));
  setImmediate(() => {
    processCampaignInline(campaignId).catch((err) => {
      logger.error({ tag: 'campaign-send', campaignId, error: err.message });
    });
  });

  return { started: true, mode: 'inline' };
}

/**
 * In-process fallback when REDIS_URL is unset.
 * @param {string} campaignId
 */
async function processCampaignInline(campaignId) {
  try {
    const recipients = await CampaignRecipient.find({ campaignId, status: 'pending' }).select('_id');
    const delayMs = Math.ceil(1000 / env.campaign.sendRatePerSecond);

    for (const recipient of recipients) {
      try {
        await sendCampaignRecipient(campaignId, String(recipient._id));
      } catch (err) {
        if (err instanceof UnrecoverableError) break;
        logger.warn({
          tag: 'campaign-send',
          campaignId,
          recipientId: recipient._id,
          error: err.message,
        });
      }
      await sleep(delayMs);
    }

    const fresh = await Campaign.findById(campaignId);
    if (fresh && fresh.status === 'sending') {
      await maybeFinalizeCampaign(campaignId);
      const stillPending = await CampaignRecipient.countDocuments({ campaignId, status: 'pending' });
      if (stillPending > 0) {
        fresh.status = 'failed';
        await fresh.save();
      }
    }
  } finally {
    activeCampaigns.delete(String(campaignId));
  }
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
