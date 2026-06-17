import { Campaign } from '../models/Campaign.js';
import { getCampaignSendQueue } from '../queue/campaignSend.queue.js';
import { startCampaignSend } from './campaignSend.service.js';
import logger from '../middleware/logsCreate.js';

export const SCHEDULED_CAMPAIGN_JOB = 'start-scheduled-campaign';

/**
 * Queue or defer a campaign send until scheduledAt.
 * @param {import('mongoose').Document} campaign
 * @param {Date} scheduledAt
 */
export async function queueCampaignAt(campaign, scheduledAt) {
  const now = Date.now();
  const at = scheduledAt.getTime();
  const delayMs = Math.max(0, at - now);

  campaign.status = 'scheduled';
  campaign.scheduledAt = scheduledAt;
  await campaign.save();

  const q = getCampaignSendQueue();
  if (q && delayMs > 0) {
    await q.add(
      SCHEDULED_CAMPAIGN_JOB,
      { campaignId: String(campaign._id) },
      {
        delay: delayMs,
        jobId: `schedule-${campaign._id}`,
        removeOnComplete: true,
        attempts: 2,
      }
    );
    return { mode: 'delayed', delayMs };
  }

  if (delayMs > 0) {
    return { mode: 'poll', delayMs };
  }

  await startCampaignSend(campaign._id);
  return { mode: 'immediate' };
}

/**
 * Poll due scheduled campaigns (fallback when Redis absent or missed jobs).
 */
export async function processDueScheduledCampaigns() {
  const due = await Campaign.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() },
  }).select('_id');

  for (const c of due) {
    try {
      await startCampaignSend(c._id);
      logger.info({ tag: 'campaign-schedule', campaignId: c._id, message: 'Started due campaign' });
    } catch (err) {
      logger.error({ tag: 'campaign-schedule', campaignId: c._id, error: err.message });
    }
  }

  return due.length;
}
