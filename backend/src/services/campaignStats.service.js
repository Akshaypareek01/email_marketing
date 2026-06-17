import { Campaign } from '../models/Campaign.js';
import { CampaignRecipient } from '../models/CampaignRecipient.js';
import { EmailEvent } from '../models/EmailEvent.js';

/** Maps internal/SES event types to campaign stat field names. */
const STAT_FIELD = {
  delivered: 'delivered',
  bounced: 'bounced',
  complaint: 'complained',
  opened: 'opened',
  clicked: 'clicked',
};

/**
 * Resolve campaignId from SES payload tags or prior sent EmailEvent.
 * @param {string} messageId
 * @param {Record<string, unknown>} payload
 */
async function resolveCampaignId(messageId, payload) {
  const tagCampaign = payload?.mail?.tags?.campaignId?.[0];
  if (tagCampaign) return String(tagCampaign);

  const sent = await EmailEvent.findOne({ messageId, eventType: 'sent' }).select('payload').lean();
  return sent?.payload?.campaignId ? String(sent.payload.campaignId) : null;
}

/**
 * Increment campaign stats when a SES event arrives for a campaign send.
 * @param {string} messageId
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
export async function updateCampaignStatsFromEvent(messageId, eventType, payload) {
  const field = STAT_FIELD[eventType];
  if (!field) return;

  const campaignId = await resolveCampaignId(messageId, payload);
  if (!campaignId) return;

  await Campaign.updateOne({ _id: campaignId }, { $inc: { [`stats.${field}`]: 1 } });

  if (eventType === 'bounced' || eventType === 'complaint') {
    const recipient = await CampaignRecipient.findOne({ campaignId, sesMessageId: messageId });
    if (recipient) {
      recipient.status = 'failed';
      recipient.error = eventType === 'complaint' ? 'Complaint' : 'Bounced';
      await recipient.save();
    }
  }
}

/**
 * Increment unsubscribed stat when a contact unsubscribes from a campaign context.
 * @param {string} campaignId
 */
export async function incrementCampaignUnsubscribe(campaignId) {
  if (!campaignId) return;
  await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.unsubscribed': 1 } });
}
