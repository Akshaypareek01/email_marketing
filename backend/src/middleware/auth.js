import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const user = await User.findById(decoded.sub).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = user;
    if (decoded.imp) {
      req.impersonatedBy = String(decoded.imp);
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Role gate. Use after `authenticate`.
 * @param {...string} roles allowed roles, e.g. authorize('super_admin')
 */
export function authorize(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Tenant admin gate — blocks `user` role from billing, team, domain setup, etc.
 * Tenant users may still view resources and send campaigns.
 */
export function requireTenantAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Tenant admin access required' });
  }
  next();
}
