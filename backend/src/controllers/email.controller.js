import { Mailbox } from '../models/Mailbox.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { EmailThread } from '../models/EmailThread.js';
import { EmailThreadMessage } from '../models/EmailThreadMessage.js';
import { env } from '../config/env.js';
import { sendEmail } from '../services/ses.service.js';
import { appendToSentFolder } from '../services/stalwart.service.js';
import { generateRfcMessageId, stripAngleBrackets } from '../services/threading.service.js';
import { snippetFrom, recordInboundCore } from '../services/inboundEmail.service.js';
import { Domain } from '../models/Domain.js';
import {
  loadTenantForSend,
  assertCanSend,
  recordSent,
} from '../services/sendingGuard.service.js';
import { isSuppressed } from '../services/suppression.service.js';
import { assertEmailVerified } from '../services/emailVerification.service.js';
import { getTenantConfigSetName } from '../services/sesConfigSet.service.js';
import { formatSenderAddress, resolveSenderDisplayName } from '../utils/senderAddress.js';
import { ingestSesEvent } from '../services/sesEvent.service.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

function normalizeAttachments(raw = []) {
  if (!Array.isArray(raw) || !raw.length) return [];

  if (raw.length > MAX_ATTACHMENTS) {
    const err = new Error(`You can attach up to ${MAX_ATTACHMENTS} files per email.`);
    err.status = 400;
    throw err;
  }

  let totalBytes = 0;
  const normalized = raw.map((item, index) => {
    const filename = String(item?.filename || '').trim();
    const contentType = String(item?.contentType || 'application/octet-stream').trim();
    const content = String(item?.content || '').trim();

    if (!filename || !content) {
      const err = new Error(`Attachment ${index + 1} is missing a filename or file data.`);
      err.status = 400;
      throw err;
    }

    let buffer;
    try {
      buffer = Buffer.from(content, 'base64');
    } catch {
      const err = new Error(`Attachment "${filename}" could not be decoded.`);
      err.status = 400;
      throw err;
    }

    if (!buffer.length) {
      const err = new Error(`Attachment "${filename}" is empty.`);
      err.status = 400;
      throw err;
    }

    totalBytes += buffer.length;
    return { filename, contentType, content, size: buffer.length };
  });

  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    const err = new Error('Total attachment size exceeds the 10 MB limit.');
    err.status = 400;
    throw err;
  }

  return normalized;
}

async function appendOutboundToThread({
  tenantId,
  mailbox,
  domain,
  thread,
  to,
  subject,
  html,
  text,
  attachments = [],
}) {
  const rfcFull = generateRfcMessageId(mailbox.address);
  const rfcStored = stripAngleBrackets(rfcFull);

  let inReplyTo = '';
  const lastInbound = await EmailThreadMessage.findOne({
    threadId: thread._id,
    direction: 'inbound',
  }).sort({ createdAt: -1 });
  if (lastInbound?.rfcMessageId) inReplyTo = lastInbound.rfcMessageId;

  const configurationSetName = await getTenantConfigSetName(tenantId);

  const result = await sendEmail({
    from: formatSenderAddress(mailbox.address, resolveSenderDisplayName(mailbox, domain)),
    to,
    subject,
    html,
    text,
    rfcMessageId: rfcStored,
    attachments,
    tenantId: String(tenantId),
    configurationSetName,
  });

  // await appendToSentFolder({
  //   principalId: mailbox.stalwartPrincipalId,
  //   rawMessage: { subject, html, text, to },
  // });

  const snip = snippetFrom(text, html);
  await EmailThreadMessage.create({
    threadId: thread._id,
    tenantId,
    mailboxId: mailbox._id,
    direction: 'outbound',
    fromAddress: mailbox.address,
    toAddress: String(to).toLowerCase().trim(),
    subject: subject || '(no subject)',
    textBody: text || '',
    htmlBody: html,
    rfcMessageId: rfcStored,
    inReplyTo: inReplyTo || undefined,
    sesMessageId: result.messageId,
    attachments: attachments.map(({ filename, contentType, size, content }) => ({
      filename,
      contentType,
      size,
      content,
    })),
  });

  await EmailThread.updateOne(
    { _id: thread._id },
    {
      $inc: { messageCount: 1 },
      $set: {
        lastActivityAt: new Date(),
        lastDirection: 'outbound',
        snippet: snip,
      },
    }
  );

  return result;
}

export async function sendOutbound(req, res, next) {
  try {
    assertEmailVerified(req.user);

    const { mailboxId, to, subject, html, text, threadId, attachments: rawAttachments } =
      req.body;
    const attachments = normalizeAttachments(rawAttachments);

    // P0 reputation/quota guardrails — evaluated before we touch SES or create a thread.
    const tenant = await loadTenantForSend(req.user.tenantId);
    assertCanSend(tenant, 1);

    const toNorm = String(to).toLowerCase().trim();
    if (await isSuppressed(toNorm, req.user.tenantId)) {
      return res.status(403).json({ message: 'Recipient is suppressed and cannot receive email.' });
    }

    const mailbox = await Mailbox.findOne({ _id: mailboxId, tenantId: req.user.tenantId });
    if (!mailbox) return res.status(404).json({ message: 'Mailbox not found' });
    const domain = await Domain.findOne({
      _id: mailbox.domainId,
      tenantId: req.user.tenantId,
    });
    
    if (!domain?.verifiedForSending) {
      return res.status(400).json({
        message: 'Domain not verified',
      });
    }
    let thread;
    if (threadId) {
      thread = await EmailThread.findOne({
        _id: threadId,
        mailboxId: mailbox._id,
        tenantId: req.user.tenantId,
      });
      if (!thread) return res.status(404).json({ message: 'Thread not found' });
    } else {
      thread = await EmailThread.create({
        tenantId: req.user.tenantId,
        mailboxId: mailbox._id,
        subject: subject || '(no subject)',
        snippet: snippetFrom(text, html),
        counterpartyEmail: String(to).toLowerCase().trim(),
        lastActivityAt: new Date(),
        lastDirection: 'outbound',
        messageCount: 0,
      });
    }

    const result = await appendOutboundToThread({
      tenantId: req.user.tenantId,
      mailbox,
      domain,
      thread,
      to,
      subject,
      html,
      text,
      attachments,
    });

    await EmailEvent.create({
      tenantId: req.user.tenantId,
      messageId: result.messageId,
      eventType: 'sent',
      payload: { from: mailbox.address, to, subject, threadId: String(thread._id) },
    });

    // Only count toward quota/reputation after SES accepted the message.
    await recordSent(req.user.tenantId, 1);

    res.status(202).json({
      message: 'Email queued for delivery',
      threadId: thread._id,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function listEvents(req, res, next) {
  try {
    const events = await EmailEvent.find({ tenantId: req.user.tenantId })
      .sort({ timestamp: -1 })
      .limit(100);
    res.json({ events });
  } catch (err) {
    next(err);
  }
}

export async function sesWebhook(req, res, next) {
  try {
    const result = await ingestSesEvent(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** Gmail-style thread list with folder-style filters */
export async function listThreads(req, res, next) {
  try {
    const { mailboxId, filter = 'all' } = req.query;
    if (!mailboxId) {
      return res.status(400).json({ message: 'mailboxId query parameter is required' });
    }

    const mailbox = await Mailbox.findOne({ _id: mailboxId, tenantId: req.user.tenantId });
    if (!mailbox) return res.status(404).json({ message: 'Mailbox not found' });

    const q = { tenantId: req.user.tenantId, mailboxId: mailbox._id };
    if (filter === 'inbox') q.lastDirection = 'inbound';
    if (filter === 'sent') q.lastDirection = 'outbound';

    const threads = await EmailThread.find(q).sort({ lastActivityAt: -1 }).limit(100).lean();
    res.json({ threads, filter });
  } catch (err) {
    next(err);
  }
}

export async function getThreadMessages(req, res, next) {
  try {
    const thread = await EmailThread.findOne({
      _id: req.params.threadId,
      tenantId: req.user.tenantId,
    });
    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    const { mailboxId } = req.query;
    if (mailboxId && String(thread.mailboxId) !== String(mailboxId)) {
      return res.status(400).json({ message: 'Thread does not belong to this mailbox' });
    }

    const messages = await EmailThreadMessage.find({ threadId: thread._id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ thread, messages });
  } catch (err) {
    next(err);
  }
}

function attachmentDisposition(contentType) {
  if (contentType.startsWith('image/') || contentType === 'application/pdf') {
    return 'inline';
  }
  return 'attachment';
}

export async function getMessageAttachment(req, res, next) {
  try {
    const index = Number.parseInt(req.params.index, 10);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ message: 'Invalid attachment index' });
    }

    const message = await EmailThreadMessage.findOne({
      _id: req.params.messageId,
      tenantId: req.user.tenantId,
    }).select('+attachments.content');

    if (!message) return res.status(404).json({ message: 'Message not found' });

    const attachment = message.attachments?.[index];
    if (!attachment?.content) {
      return res.status(404).json({
        message: 'Attachment not available. Re-send the email to store a downloadable copy.',
      });
    }

    const buffer = Buffer.from(attachment.content, 'base64');
    const safeName = attachment.filename.replace(/[^\w.\- ()[\]]+/g, '_');
    const disposition = attachmentDisposition(attachment.contentType);

    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticated: record inbound (dev). Pass inReplyTo with your last outbound Message-ID to thread.
 */
export async function recordReceivedEmail(req, res, next) {
  try {
    const {
      mailboxId,
      fromAddress,
      fromName,
      subject,
      textBody,
      htmlBody,
      inReplyTo,
      references,
      inboundMessageId,
      externalMessageId,
    } = req.body;

    const mailbox = await Mailbox.findOne({ _id: mailboxId, tenantId: req.user.tenantId });
    if (!mailbox) return res.status(404).json({ message: 'Mailbox not found' });

    const inboundId = inboundMessageId || externalMessageId;
    const result = await recordInboundCore({
      tenantId: req.user.tenantId,
      mailbox,
      fromAddress,
      fromName,
      subject,
      textBody,
      htmlBody,
      inReplyTo,
      references,
      inboundRfcId: inboundId,
    });

    if (result.duplicate) {
      return res.status(200).json({ message: 'Already recorded', email: result.message });
    }

    res.status(201).json({ email: result.message, threadId: result.thread._id });
  } catch (err) {
    next(err);
  }
}

