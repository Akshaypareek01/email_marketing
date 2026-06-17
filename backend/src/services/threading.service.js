import crypto from 'crypto';
import { EmailThreadMessage } from '../models/EmailThreadMessage.js';

/** Normalize Message-ID for storage (strip &lt; &gt;). */
export function stripAngleBrackets(id) {
  if (!id) return '';
  const s = String(id).trim();
  if (s.startsWith('<') && s.endsWith('>')) return s.slice(1, -1).trim();
  return s;
}

export function generateRfcMessageId(fromAddress) {
  const domain = (fromAddress && fromAddress.includes('@') && fromAddress.split('@')[1]) || 'localhost';
  return `<${crypto.randomUUID()}@${domain}>`;
}

export async function findParentMessage(mailboxId, inReplyTo) {
  const needle = stripAngleBrackets(inReplyTo);
  if (!needle) return null;
  return EmailThreadMessage.findOne({ mailboxId, rfcMessageId: needle });
}

/**
 * Collect RFC Message-IDs from a References header (mailparser string, array, or angle-bracketed blob).
 */
export function parseReferencesToStrippedIds(references) {
  if (!references) return [];

  const rawChunks = [];
  if (Array.isArray(references)) {
    for (const item of references) {
      if (typeof item === 'string') rawChunks.push(item);
      else if (item && typeof item === 'object' && item.value) rawChunks.push(String(item.value));
    }
  } else if (typeof references === 'string') {
    rawChunks.push(references);
  } else {
    return [];
  }

  const ids = [];
  for (const chunk of rawChunks) {
    const angle = String(chunk).match(/<[^>]+>/g);
    if (angle?.length) {
      for (const m of angle) {
        const s = stripAngleBrackets(m);
        if (s) ids.push(s);
      }
    } else {
      const s = stripAngleBrackets(chunk);
      if (s) ids.push(s);
    }
  }

  return [...new Set(ids)];
}

/** Walk References from newest toward root; return first stored message in this mailbox. */
export async function findParentFromReferences(mailboxId, references) {
  const ids = parseReferencesToStrippedIds(references);
  for (let i = ids.length - 1; i >= 0; i--) {
    const msg = await EmailThreadMessage.findOne({ mailboxId, rfcMessageId: ids[i] });
    if (msg) return msg;
  }
  return null;
}
