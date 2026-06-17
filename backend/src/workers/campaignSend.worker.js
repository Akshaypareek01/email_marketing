import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisConnection, closeRedisConnection } from '../config/redis.js';
import { CAMPAIGN_SEND_QUEUE } from '../queue/campaignSend.queue.js';
import { sendCampaignRecipient } from '../services/campaignSend.service.js';
import { SCHEDULED_CAMPAIGN_JOB } from '../services/scheduledCampaign.service.js';
import { startCampaignSend } from '../services/campaignSend.service.js';
import logger from '../middleware/logsCreate.js';

/** @type {Worker | null} */
let worker = null;

/**
 * Start the BullMQ worker that delivers campaign emails with rate limiting and retries.
 * @returns {Worker | null}
 */
export function startCampaignSendWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn({ tag: 'campaign-worker', message: 'REDIS_URL not set — worker not started' });
    return null;
  }

  if (worker) return worker;

  worker = new Worker(
    CAMPAIGN_SEND_QUEUE,
    async (job) => {
      if (job.name === SCHEDULED_CAMPAIGN_JOB) {
        const { campaignId } = job.data;
        return startCampaignSend(campaignId);
      }
      const { campaignId, recipientId } = job.data;
      return sendCampaignRecipient(campaignId, recipientId);
    },
    {
      connection,
      concurrency: 1,
      limiter: {
        max: env.campaign.sendRatePerSecond,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.debug({
      tag: 'campaign-worker',
      jobId: job.id,
      campaignId: job.data.campaignId,
      result: job.returnvalue,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error({
      tag: 'campaign-worker',
      jobId: job?.id,
      campaignId: job?.data?.campaignId,
      error: err.message,
    });
  });

  logger.info({
    tag: 'campaign-worker',
    message: 'Campaign send worker started',
    ratePerSecond: env.campaign.sendRatePerSecond,
  });

  return worker;
}

/**
 * Gracefully stop the campaign worker.
 * @returns {Promise<void>}
 */
export async function stopCampaignSendWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
  await closeRedisConnection();
}
