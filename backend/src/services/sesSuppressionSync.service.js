import {
  ListSuppressedDestinationsCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import { env } from '../config/env.js';
import { suppressAddress } from './suppression.service.js';
import logger from '../middleware/logsCreate.js';

const ses = new SESv2Client({ region: env.aws.region });

/** Map SES suppression reason to internal reason. */
function mapReason(sesReason) {
  if (sesReason === 'COMPLAINT') return 'complaint';
  if (sesReason === 'BOUNCE') return 'bounce';
  return 'manual';
}

/**
 * Sync AWS account-level suppression list into MongoDB (global scope).
 * @returns {Promise<{ synced: number }>}
 */
export async function syncAwsAccountSuppressionList() {
  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    logger.warn({ tag: 'ses-suppression-sync', message: 'AWS credentials missing — skip' });
    return { synced: 0, skipped: true };
  }

  let synced = 0;
  let nextToken;

  do {
    const res = await ses.send(
      new ListSuppressedDestinationsCommand({
        NextToken: nextToken,
        PageSize: 100,
      })
    );

    for (const item of res.SuppressedDestinationSummaries || []) {
      if (!item.EmailAddress) continue;
      await suppressAddress(item.EmailAddress, mapReason(item.Reason), {
        tenantId: null,
        source: 'aws:account-suppression-list',
      });
      synced++;
    }

    nextToken = res.NextToken;
  } while (nextToken);

  logger.info({ tag: 'ses-suppression-sync', synced });
  return { synced };
}

/**
 * Start periodic AWS suppression sync when enabled.
 */
export function startSuppressionSyncJob() {
  if (!envFlag('SES_SYNC_SUPPRESSIONS')) return;

  const run = () => {
    syncAwsAccountSuppressionList().catch((err) => {
      logger.error({ tag: 'ses-suppression-sync', error: err.message });
    });
  };

  run();
  setInterval(run, 6 * 60 * 60 * 1000);
}

function envFlag(name) {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(v);
}
