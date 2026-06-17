import { SupportTicket } from '../models/SupportTicket.js';

/** Max attachment size per file (bytes). */
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/**
 * Validate and normalize message attachments from request body.
 * @param {unknown} raw
 */
function normalizeAttachments(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (raw.length > 3) {
    const err = new Error('Maximum 3 attachments per message');
    err.status = 400;
    throw err;
  }

  return raw.map((a) => {
    const content = String(a.content || '');
    const sizeBytes = Math.ceil((content.length * 3) / 4);
    if (sizeBytes > MAX_ATTACHMENT_BYTES) {
      const err = new Error(`Attachment ${a.filename} exceeds 2MB limit`);
      err.status = 400;
      throw err;
    }
    return {
      filename: String(a.filename || 'file').trim(),
      contentType: String(a.contentType || 'application/octet-stream'),
      content,
      sizeBytes,
    };
  });
}

export async function listTickets(req, res, next) {
  try {
    const tickets = await SupportTicket.find({ tenantId: req.user.tenantId }).sort({ createdAt: -1 });
    res.json({ tickets });
  } catch (err) {
    next(err);
  }
}

export async function getTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function createTicket(req, res, next) {
  try {
    const attachments = normalizeAttachments(req.body.attachments);
    const ticket = await SupportTicket.create({
      tenantId: req.user.tenantId,
      createdBy: req.user._id,
      subject: req.body.subject.trim(),
      messages: [
        {
          authorId: req.user._id,
          authorRole: 'tenant',
          body: req.body.message.trim(),
          attachments,
        },
      ],
    });
    res.status(201).json({ ticket });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

export async function replyTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'closed') {
      return res.status(409).json({ message: 'Ticket is closed' });
    }

    ticket.messages.push({
      authorId: req.user._id,
      authorRole: 'tenant',
      body: req.body.message.trim(),
      attachments: normalizeAttachments(req.body.attachments),
    });
    if (ticket.status === 'resolved') ticket.status = 'open';
    await ticket.save();

    res.json({ ticket });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
