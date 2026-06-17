import { connectDb } from './config/db.js';
import { env, assertSecureConfig } from './config/env.js';
import logger from './middleware/logsCreate.js';
import { startCampaignSendWorker, stopCampaignSendWorker } from './workers/campaignSend.worker.js';

/**
 * Standalone BullMQ worker process for campaign email delivery.
 * Run alongside the API when REDIS_URL is configured: `npm run worker`
 */
async function main() {
  assertSecureConfig();
  await connectDb();

  const worker = startCampaignSendWorker();
  if (!worker) {
    logger.error({ tag: 'worker', message: 'Cannot start — set REDIS_URL in backend/.env' });
    process.exit(1);
  }

  logger.info({ tag: 'worker', message: `Worker ready (Redis: ${env.redis.url.replace(/:[^:@/]+@/, ':***@')})` });

  async function shutdown(signal) {
    logger.info({ tag: 'worker', message: `${signal} received — shutting down` });
    await stopCampaignSendWorker();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ tag: 'worker', message: err.message, stack: err.stack });
  process.exit(1);
});
