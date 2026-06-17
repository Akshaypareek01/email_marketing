import { listAuditLogs } from '../services/audit.service.js';

/**
 * Super admin: recent audit log entries.
 */
export async function adminListAuditLogs(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await listAuditLogs(limit);
    res.json({ logs });
  } catch (err) {
    next(err);
  }
}
