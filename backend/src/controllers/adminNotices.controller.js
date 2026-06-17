import { Tenant } from '../models/Tenant.js';
import { createAdminNotice } from '../services/systemNotice.service.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

/**
 * Super-admin: post a one-off notice to a tenant.
 */
export async function adminCreateTenantNotice(req, res, next) {
  try {
    const { title, message, severity = 'info' } = req.body;
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'title and message are required' });
    }

    const allowed = ['info', 'warning', 'danger'];
    if (!allowed.includes(severity)) {
      return res.status(400).json({ message: `severity must be one of: ${allowed.join(', ')}` });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

    const notice = await createAdminNotice({
      tenantId: tenant._id,
      title: title.trim(),
      message: message.trim(),
      severity,
    });

    await writeAuditLog({
      ...auditContext(req),
      tenantId: tenant._id,
      action: 'admin.notice.create',
      targetType: 'SystemNotice',
      targetId: String(notice._id),
      metadata: { title: notice.title, severity },
    });

    res.status(201).json({ notice });
  } catch (err) {
    next(err);
  }
}
