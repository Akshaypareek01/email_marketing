import { SupportTicket } from '../models/SupportTicket.js';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/**
 * @param {unknown} raw
 */
function normalizeAttachments(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.slice(0, 3).map((a) => ({
    filename: String(a.filename || 'file').trim(),
    contentType: String(a.contentType || 'application/octet-stream'),
    content: String(a.content || ''),
    sizeBytes: Math.ceil((String(a.content || '').length * 3) / 4),
  })).filter((a) => a.sizeBytes <= MAX_ATTACHMENT_BYTES);
}

export async function adminListTickets(req, res, next) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const take = Math.min(100, Math.max(1, Number(limit)));

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).lean(),
      SupportTicket.countDocuments(filter),
    ]);

    const tenantIds = [...new Set(tickets.map((t) => String(t.tenantId)))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean();
    const tenantMap = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

    const enriched = tickets.map((t) => ({
      ...t,
      tenant: tenantMap[String(t.tenantId)] || null,
    }));

    res.json({ tickets: enriched, total, page: Number(page), limit: take });
  } catch (err) {
    next(err);
  }
}

export async function adminGetTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const tenant = await Tenant.findById(ticket.tenantId).select('name slug').lean();
    res.json({ ticket: { ...ticket, tenant } });
  } catch (err) {
    next(err);
  }
}

export async function adminReplyTicket(req, res, next) {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.messages.push({
      authorId: req.user._id,
      authorRole: 'admin',
      body: req.body.message.trim(),
      attachments: normalizeAttachments(req.body.attachments),
    });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    await ticket.save();

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}

export async function adminSetTicketStatus(req, res, next) {
  try {
    const { status } = req.body;
    const allowed = ['open', 'in_progress', 'resolved', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}


/**
 * Assign ticket to a super-admin user.
 */
export async function adminAssignTicket(req, res, next) {
  try {
    const { assigneeId } = req.body;
    const assignee = assigneeId
      ? await User.findOne({ _id: assigneeId, role: 'super_admin' })
      : null;
    if (assigneeId && !assignee) {
      return res.status(400).json({ message: 'Invalid assignee' });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      { $set: { assigneeId: assignee?._id || null } },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
}
