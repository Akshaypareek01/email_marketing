import { randomUUID } from 'node:crypto';
import { EmailThread } from '../models/EmailThread.js';
import { EmailThreadMessage } from '../models/EmailThreadMessage.js';
import {
  findParentFromReferences,
  findParentMessage,
  stripAngleBrackets,
} from './threading.service.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

export function snippetFrom(text, html) {
  const raw = (text || html || '').replace(/\s+/g, ' ').trim();
  return raw.slice(0, 160);
}

/**
 * Map mailparser attachments to EmailThreadMessage schema (base64 content, select:false in queries).
 */
export function normalizeInboundMailparserAttachments(attachments = []) {
  if (!Array.isArray(attachments) || !attachments.length) return undefined;

  const slice = attachments.slice(0, MAX_ATTACHMENTS);
  let totalBytes = 0;
  const out = [];

  for (const a of slice) {
    const filename = String(a.filename || 'unnamed').trim() || 'unnamed';
    const contentType = String(a.contentType || 'application/octet-stream').trim();
    const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content || []);

    if (!buf.length) continue;

    totalBytes += buf.length;
    if (totalBytes > MAX_ATTACHMENT_BYTES) break;

    out.push({
      filename,
      contentType,
      size: buf.length,
      content: buf.toString('base64'),
    });
  }

  return out.length ? out : undefined;
}

/**
 * Shape a mailparser result for {@link recordInboundCore}.
 */
export function shapeInboundFromParsed(parsed) {
  const fromVal = parsed.from?.value?.[0];
  const fromAddress = (fromVal?.address || '').toLowerCase().trim();
  const fromName = (fromVal?.name || '').trim();

  return {
    fromAddress,
    fromName,
    subject: parsed.subject,
    textBody: parsed.text || '',
    htmlBody: parsed.html,
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    attachments: normalizeInboundMailparserAttachments(parsed.attachments),
  };
}

export async function recordInboundCore({
  tenantId,
  mailbox,
  fromAddress,
  fromName,
  subject,
  textBody,
  htmlBody,
  inReplyTo,
  references,
  inboundRfcId,
  attachments,
}) {
  const from = String(fromAddress).toLowerCase().trim();
  const inboundRfc =
    stripAngleBrackets(inboundRfcId) ||
    `inbound-${randomUUID()}@${mailbox.address.split('@')[1] || 'local'}`;

  const dup = await EmailThreadMessage.findOne({ mailboxId: mailbox._id, rfcMessageId: inboundRfc });
  if (dup) return { duplicate: true, message: dup };

  let parent = inReplyTo ? await findParentMessage(mailbox._id, inReplyTo) : null;
  if (!parent && references) {
    parent = await findParentFromReferences(mailbox._id, references);
  }

  let thread;
  if (parent) {
    thread = await EmailThread.findById(parent.threadId);
    if (!thread || String(thread.tenantId) !== String(tenantId)) {
      thread = null;
    }
  }

  if (!thread) {
    thread = await EmailThread.create({
      tenantId,
      mailboxId: mailbox._id,
      subject: subject || '(no subject)',
      snippet: snippetFrom(textBody, htmlBody),
      counterpartyEmail: from,
      lastActivityAt: new Date(),
      lastDirection: 'inbound',
      messageCount: 0,
    });
  }

  const msg = await EmailThreadMessage.create({
    threadId: thread._id,
    tenantId,
    mailboxId: mailbox._id,
    direction: 'inbound',
    fromAddress: from,
    toAddress: mailbox.address,
    fromName,
    subject: subject || '(no subject)',
    textBody: textBody || '',
    htmlBody,
    rfcMessageId: inboundRfc,
    inReplyTo: stripAngleBrackets(inReplyTo) || undefined,
    attachments,
  });

  await EmailThread.updateOne(
    { _id: thread._id },
    {
      $inc: { messageCount: 1 },
      $set: {
        lastActivityAt: new Date(),
        lastDirection: 'inbound',
        snippet: snippetFrom(textBody, htmlBody),
      },
    }
  );

  return { duplicate: false, thread, message: msg };
}
