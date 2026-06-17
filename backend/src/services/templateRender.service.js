import { env } from '../config/env.js';
import { signUnsubscribeToken } from './unsubscribeToken.service.js';

/**
 * Replace merge tags in template HTML/subject with contact fields.
 * @param {string} text
 * @param {Record<string, string>} vars
 */
export function renderMergeTags(text, vars) {
  let out = String(text || '');
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, val ?? '');
  }
  return out;
}

/**
 * Build personalization vars for a contact row.
 * @param {{ email: string, firstName?: string, lastName?: string, company?: string }} contact
 * @param {string} unsubscribeUrl
 */
export function contactMergeVars(contact, unsubscribeUrl) {
  return {
    first_name: contact.firstName || 'there',
    last_name: contact.lastName || '',
    email: contact.email,
    company: contact.company || '',
    unsubscribe_url: unsubscribeUrl,
  };
}

/**
 * Build one-click unsubscribe URL (RFC 8058 — mail clients POST here).
 * @param {string} _appUrl unused — kept for call-site compatibility
 * @param {string} email
 * @param {string} tenantId
 */
export function buildUnsubscribeUrl(_appUrl, email, tenantId) {
  const base = env.apiPublicUrl.replace(/\/$/, '');
  const token = signUnsubscribeToken(email, tenantId);
  const qs = new URLSearchParams({ token });
  return `${base}/public/unsubscribe?${qs.toString()}`;
}

/**
 * Human-readable unsubscribe page URL (browser clicks from email footer).
 * @param {string} email
 * @param {string} tenantId
 */
export function buildUnsubscribePageUrl(email, tenantId) {
  const base = env.appUrl.replace(/\/$/, '');
  const token = signUnsubscribeToken(email, tenantId);
  const qs = new URLSearchParams({ token });
  return `${base}/unsubscribe?${qs.toString()}`;
}
