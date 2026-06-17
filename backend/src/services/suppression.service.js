import { Suppression } from '../models/Suppression.js';
import { Contact } from '../models/Contact.js';

/**
 * Record a suppressed address (global + optional tenant scope).
 * @param {string} email
 * @param {'bounce'|'complaint'|'unsubscribe'|'manual'} reason
 * @param {{ tenantId?: import('mongoose').Types.ObjectId | null, source?: string }} opts
 */
export async function suppressAddress(email, reason, opts = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;

  const { tenantId = null, source = '' } = opts;

  await Suppression.findOneAndUpdate(
    { email: normalized, tenantId: tenantId ?? null },
    { $set: { reason, source } },
    { upsert: true }
  );

  // Hard bounces and complaints are global — one bad address must never be mailed again.
  if (reason === 'bounce' || reason === 'complaint') {
    await Suppression.findOneAndUpdate(
      { email: normalized, tenantId: null },
      { $set: { reason, source: source || 'global' } },
      { upsert: true }
    );
  }

  const contactStatus = reason === 'complaint' ? 'complained' : reason === 'bounce' ? 'bounced' : 'unsubscribed';
  if (tenantId) {
    await Contact.updateMany(
      { tenantId, email: normalized },
      { $set: { status: contactStatus } }
    );
  } else {
    await Contact.updateMany({ email: normalized }, { $set: { status: contactStatus } });
  }
}

/**
 * Extract recipient emails from an SES bounce/complaint notification payload.
 * @param {Record<string, unknown>} payload
 */
function extractAffectedEmails(payload) {
  const emails = new Set();

  const bounce = payload?.bounce;
  if (bounce && typeof bounce === 'object') {
    const recipients = /** @type {{ emailAddress?: string }[]} */ (bounce.bouncedRecipients || []);
    recipients.forEach((r) => {
      if (r?.emailAddress) emails.add(r.emailAddress.toLowerCase());
    });
  }

  const complaint = payload?.complaint;
  if (complaint && typeof complaint === 'object') {
    const recipients = /** @type {{ emailAddress?: string }[]} */ (complaint.complainedRecipients || []);
    recipients.forEach((r) => {
      if (r?.emailAddress) emails.add(r.emailAddress.toLowerCase());
    });
  }

  const mailTo = payload?.mail?.destination;
  if (Array.isArray(mailTo)) {
    mailTo.forEach((e) => emails.add(String(e).toLowerCase()));
  }

  return [...emails];
}

/**
 * Handle soft bounces — retry tracking; suppress after threshold.
 * @param {Record<string, unknown>} payload
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 */
export async function handleSoftBounceFromSes(payload, tenantId) {
  const emails = extractAffectedEmails(payload);
  const threshold = Number(process.env.SOFT_BOUNCE_THRESHOLD) || 3;

  for (const email of emails) {
    const contact = await Contact.findOneAndUpdate(
      { tenantId, email },
      { $inc: { softBounceCount: 1 } },
      { new: true }
    );
    if (contact && contact.softBounceCount >= threshold) {
      await suppressAddress(email, 'bounce', { tenantId, source: 'ses:soft_bounce' });
    }
  }

  return emails.length;
}

/**
 * Process bounce/complaint SES events — auto-suppress and update contacts.
 * @param {Record<string, unknown>} payload
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 * @param {'bounced'|'complaint'} eventType
 */
export async function handleSuppressionFromSes(payload, tenantId, eventType) {
  const reason = eventType === 'complaint' ? 'complaint' : 'bounce';
  const emails = extractAffectedEmails(payload);

  for (const email of emails) {
    await suppressAddress(email, reason, {
      tenantId,
      source: `ses:${eventType}`,
    });
  }

  return emails.length;
}

/**
 * Returns true if address is on global or tenant suppression list.
 * @param {string} email
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 */
export async function isSuppressed(email, tenantId) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return true;

  const hit = await Suppression.exists({
    email: normalized,
    $or: [{ tenantId: null }, { tenantId }],
  });
  return Boolean(hit);
}
