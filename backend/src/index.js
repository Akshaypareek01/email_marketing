import app from './app.js';
import { connectDb } from './config/db.js';
import { env, assertSecureConfig } from './config/env.js';
import logger from './middleware/logsCreate.js';
import { startBillingGraceJob } from './jobs/billingGrace.job.js';
import { startPlatformReputationJob } from './jobs/platformReputation.job.js';
import { processDueScheduledCampaigns } from './services/scheduledCampaign.service.js';
import { startSuppressionSyncJob } from './services/sesSuppressionSync.service.js';

async function start() {
  try {
    assertSecureConfig();

    if (!env.ses.enableConfigSets) {
      logger.warn({
        tag: 'startup',
        message:
          'SES_CONFIG_SETS_ENABLED is off — per-tenant SES event destinations are not created. ' +
          'Bounce/complaint events may not flow, so reputation auto-pause cannot trigger. ' +
          'Enable config sets (or configure account-level SNS notifications) in production.',
      });
    }

    await connectDb();
    startBillingGraceJob();
    startSuppressionSyncJob();
    startPlatformReputationJob();
    setInterval(() => {
      processDueScheduledCampaigns().catch((err) => {
        logger.error({ tag: 'campaign-schedule', error: err.message });
      });
    }, 60 * 1000);

    app.listen(env.port, () => {
      logger.info({
        tag: 'startup',
        message: `API listening on http://localhost:${env.port}`,
        logLevel: env.logLevel,
        imapHost: env.imap.host,
        imapUser: env.imap.user,
        imapSyncFolders: env.imap.syncFolders,
        stalwartApiUrl: env.stalwart.apiUrl,
      });
    });
  } catch (err) {
    logger.error({ tag: 'startup', message: 'Failed to start server', error: err.message, stack: err.stack });
    process.exit(1);
  }
}

start();
