import { Contact } from '../models/Contact.js';

/** Common role-based local parts that hurt deliverability on bulk sends. */
const ROLE_LOCALS = new Set([
  'info', 'admin', 'support', 'sales', 'contact', 'help', 'office', 'team',
  'noreply', 'no-reply', 'postmaster', 'abuse', 'webmaster', 'billing',
]);

/** Known disposable email domains (subset — extend as needed). */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
  'throwaway.email', 'yopmail.com', 'sharklasers.com', 'trashmail.com',
]);

/**
 * Returns true if the address looks like a role/generic inbox.
 * @param {string} email
 */
export function isRoleAddress(email) {
  const local = String(email || '').split('@')[0]?.toLowerCase().trim();
  return ROLE_LOCALS.has(local);
}

/**
 * Returns true if the domain is a known disposable provider.
 * @param {string} email
 */
export function isDisposableEmail(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase().trim();
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

/**
 * Analyze list hygiene for campaign pre-flight (PRD §6.3).
 * Small lists get warnings only — blockers apply once the list is large enough to be meaningful.
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 * @param {import('mongoose').Types.ObjectId | string} listId
 */
export async function analyzeListHygiene(tenantId, listId) {
  const contacts = await Contact.find({
    tenantId,
    listIds: listId,
    status: 'subscribed',
  })
    .select('email status')
    .lean();

  const total = contacts.length;
  if (total === 0) {
    return {
      ok: false,
      blockers: ['List has no subscribed contacts'],
      warnings: [],
      notes: ['List has no subscribed contacts'],
      rolePct: 0,
      disposablePct: 0,
    };
  }

  let roleCount = 0;
  let disposableCount = 0;

  for (const c of contacts) {
    if (isRoleAddress(c.email)) roleCount++;
    if (isDisposableEmail(c.email)) disposableCount++;
  }

  const bouncedInList = await Contact.countDocuments({
    tenantId,
    listIds: listId,
    status: { $in: ['bounced', 'complained'] },
  });

  const rolePct = Math.round((roleCount / total) * 100);
  const disposablePct = Math.round((disposableCount / total) * 100);
  const blockers = [];
  const warnings = [];
  /** Lists under this size only get hygiene warnings, not send blockers. */
  const minListForBlock = 10;

  if (rolePct > 30) {
    const msg = `High role-address ratio (${rolePct}%) — remove generic inboxes like info@, admin@, support@`;
    if (total >= minListForBlock) blockers.push(msg);
    else warnings.push(`${msg} (small test list — OK for now, clean before a real send)`);
  }
  if (disposablePct > 5) {
    const msg = `Disposable addresses detected (${disposablePct}%) — remove before sending`;
    if (total >= minListForBlock) blockers.push(msg);
    else warnings.push(`${msg} (small test list)`);
  }
  if (bouncedInList > 0) {
    warnings.push(`${bouncedInList} previously bounced/complained contacts still on list — remove them in Contacts`);
  }

  const notes = [...blockers, ...warnings];
  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    notes,
    rolePct,
    disposablePct,
    priorBadCount: bouncedInList,
    total,
  };
}
