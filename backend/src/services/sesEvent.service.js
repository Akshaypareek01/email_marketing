import { EmailEvent } from '../models/EmailEvent.js';
import logger from '../middleware/logsCreate.js';
import { handleSuppressionFromSes, handleSoftBounceFromSes } from './suppression.service.js';
import { recordReputationEvent } from './sendingGuard.service.js';
import { updateCampaignStatsFromEvent } from './campaignStats.service.js';
import { schedulePlatformReputationCheck } from '../jobs/platformReputation.job.js';

/**
 * Map SES notification event types to internal event types.
 * @param {string | undefined} type
 */
export function mapSesEventType(type) {
  const map = {
    Delivery: 'delivered',
    Bounce: 'bounced',
    Complaint: 'complaint',
    Reject: 'rejected',
    Send: 'sent',
    Open: 'opened',
    Click: 'clicked',
  };
  // Unknown/malformed types return null and are IGNORED — never silently counted
  // as a delivery (which would mask bounce/complaint problems).
  return map[type] || null;
}

/**
 * Detect soft (transient) bounces from SES payload.
 * @param {Record<string, unknown>} payload
 */
export function isSoftBounce(payload) {
  const bounceType = payload?.bounce?.bounceType;
  return bounceType === 'Transient' || bounceType === 'Undetermined';
}

/**
 * Normalize SES payloads from direct POST or SNS Notification wrapper.
 * @param {Record<string, unknown>} raw
 */
export function normalizeSesPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;

  if (raw.mail && (raw.eventType || raw.notificationType)) {
    return raw;
  }

  if (raw.Message && typeof raw.Message === 'string') {
    try {
      return JSON.parse(raw.Message);
    } catch {
      return null;
    }
  }

  return raw;
}

/**
 * Ingest one SES event: log, suppress on bounce/complaint, update reputation + campaign stats.
 * @param {Record<string, unknown>} rawPayload
 */
export async function ingestSesEvent(rawPayload) {
  const payload = normalizeSesPayload(rawPayload);
  if (!payload) {
    return { received: true, ignored: 'invalid_payload' };
  }

  const messageId = payload?.mail?.messageId || payload?.messageId;
  const rawType = payload?.eventType || payload?.notificationType;
  let eventType = mapSesEventType(rawType);

  if (rawType === 'Bounce' && isSoftBounce(payload)) {
    eventType = 'soft_bounced';
  }

  if (!eventType) {
    return { received: true, ignored: `unhandled_type:${rawType || 'unknown'}` };
  }

  if (!messageId) {
    return { received: true, ignored: 'missing messageId' };
  }

  let tenantId = payload?.tenantId || payload?.mail?.tags?.tenantId?.[0];
  if (!tenantId) {
    const origin = await EmailEvent.findOne({ messageId, eventType: 'sent' })
      .select('tenantId')
      .lean();
    tenantId = origin?.tenantId;
  }
  if (!tenantId) {
    // A real bounce/complaint we cannot attribute is a blind spot — surface it.
    logger.warn({ tag: 'ses-event', message: 'Unattributed SES event dropped', messageId, eventType });
    return { received: true, ignored: 'unknown tenant' };
  }

  const exists = await EmailEvent.exists({ tenantId, messageId, eventType });
  if (exists) {
    return { received: true, duplicate: true };
  }

  await EmailEvent.create({ tenantId, messageId, eventType, payload });

  if (eventType === 'bounced' || eventType === 'complaint') {
    await handleSuppressionFromSes(payload, tenantId, eventType);
  } else if (eventType === 'soft_bounced') {
    await handleSoftBounceFromSes(payload, tenantId);
  }

  await updateCampaignStatsFromEvent(messageId, eventType, payload);

  const repType = eventType === 'soft_bounced' ? 'bounced' : eventType === 'complaint' ? 'complaint' : eventType;
  const result = await recordReputationEvent(tenantId, repType);

  if (['bounced', 'complaint', 'soft_bounced'].includes(eventType)) {
    schedulePlatformReputationCheck();
  }

  return { received: true, autoPaused: Boolean(result?.paused), warned: Boolean(result?.warned) };
}
