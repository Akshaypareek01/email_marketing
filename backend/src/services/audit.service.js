import { AuditLog } from '../models/AuditLog.js';

/**
 * Append an immutable audit log entry.
 * @param {object} entry
 * @param {string} [entry.actorId]
 * @param {string} [entry.actorEmail]
 * @param {string} [entry.actorRole]
 * @param {string} [entry.tenantId]
 * @param {string} entry.action
 * @param {string} [entry.targetType]
 * @param {string} [entry.targetId]
 * @param {Record<string, unknown>} [entry.metadata]
 * @param {string} [entry.ip]
 */
export async function writeAuditLog(entry) {
  try {
    await AuditLog.create(entry);
  } catch {
    /* audit must not break primary flows */
  }
}

/**
 * List recent audit entries for super admin.
 * @param {number} limit
 */
export async function listAuditLogs(limit = 100) {
  return AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 500))
    .lean();
}

/**
 * Build audit context from an Express request + optional user.
 * @param {import('express').Request} req
 * @param {import('../models/User.js').User | null} [user]
 */
export function auditContext(req, user = null) {
  const actor = user || req.user;
  return {
    actorId: actor?._id || null,
    actorEmail: actor?.email || '',
    actorRole: actor?.role || '',
    tenantId: actor?.tenantId || null,
    ip: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || '',
  };
}
