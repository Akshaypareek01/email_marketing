import mongoose from 'mongoose';
import { suppressAddress, isSuppressed } from '../services/suppression.service.js';
import { verifyUnsubscribeToken } from '../services/unsubscribeToken.service.js';
import { Tenant } from '../models/Tenant.js';

/**
 * Resolve email + tenant from signed token or legacy query/body params.
 * @param {import('express').Request} req
 * @returns {{ email: string, tenantId: string } | null}
 */
function resolveUnsubscribeIdentity(req) {
  const token = String(req.body.token || req.query.token || '').trim();
  if (token) {
    try {
      return verifyUnsubscribeToken(token);
    } catch {
      return null;
    }
  }

  const email = String(req.body.email || req.query.email || '').trim().toLowerCase();
  const tenantId = String(req.body.tenantId || req.query.tenant || req.query.tenantId || '').trim();
  if (!email || !tenantId) return null;
  return { email, tenantId };
}

/**
 * Public one-click / form unsubscribe (PRD §6.5).
 * POST body: { token } or legacy { email, tenantId }.
 */
export async function unsubscribe(req, res, next) {
  try {
    const identity = resolveUnsubscribeIdentity(req);
    if (!identity) {
      return res.status(400).json({ message: 'Valid unsubscribe token is required' });
    }

    const { email, tenantId } = identity;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
      return res.status(400).json({ message: 'Valid tenant id is required' });
    }

    const tenant = await Tenant.findById(tenantId).select('name');
    if (!tenant) {
      return res.status(404).json({ message: 'Invalid unsubscribe link' });
    }

    await suppressAddress(email, 'unsubscribe', {
      tenantId,
      source: 'public_unsubscribe',
    });

    res.json({
      ok: true,
      message: `You have been unsubscribed from ${tenant.name}.`,
      email,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Check suppression status for an email + tenant (public).
 */
export async function unsubscribeStatus(req, res, next) {
  try {
    const identity = resolveUnsubscribeIdentity(req);
    if (!identity) {
      return res.status(400).json({ message: 'Valid unsubscribe token is required' });
    }

    const { email, tenantId } = identity;

    const suppressed = await isSuppressed(email, tenantId);
    res.json({ email, suppressed });
  } catch (err) {
    next(err);
  }
}
