/**
 * Format an RFC 5322 From address with optional display name (shown in inbox clients).
 * @param {string} address e.g. hello@company.com
 * @param {string} [displayName] e.g. Acme Inc
 */
export function formatSenderAddress(address, displayName) {
  const email = String(address || '').trim();
  const name = String(displayName || '').trim();
  if (!email) return '';
  if (!name) return email;
  const safe = name.replace(/["\\]/g, '');
  return `"${safe}" <${email}>`;
}

/**
 * Pick the best display name for a mailbox (mailbox → domain branding).
 * @param {{ displayName?: string } | null} mailbox
 * @param {{ branding?: { fromDisplayName?: string } } | null} domain
 */
export function resolveSenderDisplayName(mailbox, domain) {
  const fromMailbox = mailbox?.displayName?.trim();
  if (fromMailbox) return fromMailbox;
  return domain?.branding?.fromDisplayName?.trim() || '';
}
