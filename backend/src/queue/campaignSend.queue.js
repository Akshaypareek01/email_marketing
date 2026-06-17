import { Queue } from 'bullmq';
import { getRedisConnection, isRedisEnabled } from '../config/redis.js';

export const CAMPAIGN_SEND_QUEUE = 'campaign-send';

/** @type {Queue | null} */
let queue = null;

/**
 * Lazy BullMQ queue for durable campaign recipient delivery.
 * @returns {Queue | null}
 */
export function getCampaignSendQueue() {
  if (!isRedisEnabled()) return null;

  const connection = getRedisConnection();
  if (!connection) return null;

  if (!queue) {
    queue = new Queue(CAMPAIGN_SEND_QUEUE, { connection });
  }

  return queue;
}

/**
 * Enqueue one job per pending campaign recipient.
 * @param {string} campaignId
 * @returns {Promise<{ enqueued: number, mode: 'queue' | 'inline' }>}
 */
export async function enqueueCampaignRecipientJobs(campaignId) {
  const q = getCampaignSendQueue();
  if (!q) {
    return { enqueued: 0, mode: 'inline' };
  }

  const { CampaignRecipient } = await import('../models/CampaignRecipient.js');
  const recipients = await CampaignRecipient.find({ campaignId, status: 'pending' })
    .select('_id')
    .lean();

  if (!recipients.length) {
    return { enqueued: 0, mode: 'queue' };
  }

  await q.addBulk(
    recipients.map((r) => ({
      name: 'recipient',
      data: {
        campaignId: String(campaignId),
        recipientId: String(r._id),
      },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    }))
  );

  return { enqueued: recipients.length, mode: 'queue' };
}

/**
 * Close the campaign send queue (graceful shutdown).
 * @returns {Promise<void>}
 */
export async function closeCampaignSendQueue() {
  if (!queue) return;
  await queue.close();
  queue = null;
}
