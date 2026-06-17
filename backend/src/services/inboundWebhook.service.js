import { Mailbox } from '../models/Mailbox.js';
import logger from '../middleware/logsCreate.js';
import { fetchEmails, getMailboxImapCredentials } from './stalwart.service.js';
import { publishMailEvent } from './realtime.service.js';
import { recordInboundCore } from './inboundEmail.service.js';

const INGEST_EVENTS = new Set([
  'message-ingest.ham',
  'message-ingest.spam',
  'message-ingest.imap-append',
  'message-ingest.jmap-append',
]);

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const syncTimers = new Map();

/**
 * Debounced IMAP sync for a mailbox address (avoids webhook bursts).
 * @param {import('../models/Mailbox.js').Mailbox} mailbox
 */
function scheduleImapSync(mailbox) {
  const key = String(mailbox._id);
  if (syncTimers.has(key)) clearTimeout(syncTimers.get(key));

  syncTimers.set(
    key,
    setTimeout(async () => {
      syncTimers.delete(key);
      const doc = await Mailbox.findById(mailbox._id).select('+imapPasswordEnc');
      const credentials = getMailboxImapCredentials(doc);
      if (!credentials) {
        logger.warn({ tag: 'inbound-webhook', message: 'No IMAP credentials', address: mailbox.address });
        return;
      }

      try {
        const stats = await fetchEmails(credentials);
        publishMailEvent({
          tenantId: String(mailbox.tenantId),
          mailboxId: String(mailbox._id),
          address: mailbox.address,
          reason: 'imap-sync',
          stats,
        });
        logger.info({ tag: 'inbound-webhook', action: 'synced', address: mailbox.address, stats });
      } catch (err) {
        logger.error({ tag: 'inbound-webhook', action: 'sync-failed', address: mailbox.address, error: err.message });
      }
    }, 1200)
  );
}

/**
 * @param {Record<string, unknown>} data
 * @returns {string | null}
 */
function recipientFromEventData(data) {
  if (!data || typeof data !== 'object') return null;

  const candidates = [data.to, data.recipient, data.email, data.accountEmail];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.includes('@')) {
      return raw.toLowerCase().trim();
    }
    if (Array.isArray(raw)) {
      const hit = raw.find((v) => typeof v === 'string' && v.includes('@'));
      if (hit) return String(hit).toLowerCase().trim();
    }
  }
  return null;
}

/**
 * Handle Stalwart telemetry webhook batch.
 * @param {{ events?: { type?: string, data?: Record<string, unknown> }[] }} body
 */
export async function handleStalwartWebhookBatch(body) {
  const events = Array.isArray(body?.events) ? body.events : [];
  const addresses = new Set();

  for (const event of events) {
    if (!event?.type || !INGEST_EVENTS.has(event.type)) continue;
    const to = recipientFromEventData(event.data);
    if (to) addresses.add(to);
  }

  const results = [];
  for (const address of addresses) {
    const mailbox = await Mailbox.findOne({ address });
    if (!mailbox) {
      logger.warn({ tag: 'inbound-webhook', message: 'Unknown recipient', address });
      continue;
    }
    scheduleImapSync(mailbox);
    results.push({ address, mailboxId: mailbox._id, queued: true });
  }

  return { processed: results.length, results };
}

/**
 * Simple JSON webhook (manual / custom integrators).
 */
export async function handleSimpleInboundWebhook(body) {
  const {
    to,
    from,
    fromName,
    subject,
    text,
    html,
    messageId,
    inReplyTo,
    references,
  } = body || {};

  if (!to || !from) {
    throw Object.assign(new Error('to and from are required'), { status: 400 });
  }

  const toAddress = String(to).toLowerCase().trim();
  const mailbox = await Mailbox.findOne({ address: toAddress });
  if (!mailbox) {
    throw Object.assign(new Error('No mailbox for recipient address'), { status: 404 });
  }

  const result = await recordInboundCore({
    tenantId: mailbox.tenantId,
    mailbox,
    fromAddress: from,
    fromName,
    subject,
    textBody: text,
    htmlBody: html,
    inReplyTo,
    references,
    inboundRfcId: messageId,
  });

  publishMailEvent({
    tenantId: String(mailbox.tenantId),
    mailboxId: String(mailbox._id),
    address: mailbox.address,
    reason: 'webhook-simple',
    threadId: result.thread?._id ? String(result.thread._id) : undefined,
  });

  return result;
}
