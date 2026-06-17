import { Suppression } from '../models/Suppression.js';
import { Tenant } from '../models/Tenant.js';

/**
 * List suppression entries (global + per-tenant) for operator review.
 */
export async function adminListSuppressions(req, res, next) {
  try {
    const { q, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (q) {
      filter.email = new RegExp(String(q).trim(), 'i');
    }

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const take = Math.min(100, Math.max(1, Number(limit)));

    const [rows, total] = await Promise.all([
      Suppression.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(take).lean(),
      Suppression.countDocuments(filter),
    ]);

    const tenantIds = rows.filter((r) => r.tenantId).map((r) => r.tenantId);
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name slug').lean();
    const tenantMap = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

    const suppressions = rows.map((r) => ({
      ...r,
      tenant: r.tenantId ? tenantMap[String(r.tenantId)] || null : null,
      scope: r.tenantId ? 'tenant' : 'global',
    }));

    res.json({ suppressions, total, page: Number(page), limit: take });
  } catch (err) {
    next(err);
  }
}

/**
 * Remove a manual suppression entry (operator override).
 */
export async function adminDeleteSuppression(req, res, next) {
  try {
    const row = await Suppression.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: 'Suppression not found' });
    res.json({ suppression: row });
  } catch (err) {
    next(err);
  }
}
