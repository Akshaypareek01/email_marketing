const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize and validate an email address for import.
 * @param {string} raw
 * @returns {{ ok: true, email: string } | { ok: false, error: string }}
 */
export function parseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Missing email' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Invalid email format' };
  return { ok: true, email };
}

/**
 * Map a CSV row object to contact fields using column mapping.
 * @param {Record<string, string>} row
 * @param {Record<string, string>} mapping e.g. { email: 'Email', firstName: 'First Name' }
 */
export function mapRowToContact(row, mapping) {
  const get = (field) => {
    const col = mapping[field];
    if (!col) return '';
    return String(row[col] ?? '').trim();
  };

  return {
    email: get('email'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    company: get('company'),
    tags: get('tags')
      ? get('tags')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  };
}

/**
 * Build CSV export string from contact documents.
 * @param {Array<{ email: string, firstName?: string, lastName?: string, company?: string, status?: string, tags?: string[] }>} contacts
 */
export function contactsToCsv(contacts) {
  const header = 'email,first_name,last_name,company,status,tags';
  const lines = contacts.map((c) => {
    const tags = (c.tags || []).join(';');
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [c.email, c.firstName, c.lastName, c.company, c.status, tags].map(esc).join(',');
  });
  return [header, ...lines].join('\n');
}

/**
 * Check template HTML contains unsubscribe placeholder (PRD §5.7 / §6.5).
 * @param {string} html
 */
export function hasUnsubscribeFooter(html) {
  const h = String(html || '').toLowerCase();
  return h.includes('{{unsubscribe_url}}') || h.includes('unsubscribe');
}
