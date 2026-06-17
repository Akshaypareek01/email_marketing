import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import logger from '../middleware/logsCreate.js';

const ses = new SESv2Client({ region: env.aws.region });

/**
 * Derive a stable SES configuration set name for a tenant.
 * @param {string} tenantId
 * @returns {string}
 */
export function tenantConfigSetName(tenantId) {
  const raw = `mailbox-tenant-${String(tenantId).replace(/[^a-zA-Z0-9-]/g, '')}`;
  return raw.slice(0, 64);
}

/**
 * Ensure a per-tenant SES configuration set exists and is stored on the tenant record.
 * No-op when SES_CONFIG_SETS_ENABLED is false or AWS credentials are missing.
 * @param {string} tenantId
 * @returns {Promise<string | null>}
 */
export async function ensureTenantConfigSet(tenantId) {
  if (!env.ses.enableConfigSets) return null;
  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    logger.warn({ tag: 'ses-config-set', message: 'Skipping — AWS credentials not configured' });
    return null;
  }

  const name = tenantConfigSetName(tenantId);

  try {
    await ses.send(new CreateConfigurationSetCommand({ ConfigurationSetName: name }));
  } catch (err) {
    if (err.name !== 'AlreadyExistsException') throw err;
  }

  if (env.ses.snsTopicArn) {
    try {
      await ses.send(
        new CreateConfigurationSetEventDestinationCommand({
          ConfigurationSetName: name,
          EventDestinationName: 'sns-events',
          EventDestination: {
            Enabled: true,
            MatchingEventTypes: ['SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'OPEN', 'CLICK'],
            SnsDestination: { TopicArn: env.ses.snsTopicArn },
          },
        })
      );
    } catch (err) {
      if (err.name !== 'AlreadyExistsException') throw err;
    }
  }

  await Tenant.updateOne({ _id: tenantId }, { $set: { 'ses.configSetName': name } });
  logger.info({ tag: 'ses-config-set', tenantId, configSetName: name });
  return name;
}

/**
 * Load the tenant's configuration set name if configured.
 * @param {string} tenantId
 * @returns {Promise<string | undefined>}
 */
export async function getTenantConfigSetName(tenantId) {
  const tenant = await Tenant.findById(tenantId).select('ses.configSetName').lean();
  return tenant?.ses?.configSetName || undefined;
}
