import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Issue a short-lived JWT for super-admin impersonation of a tenant user.
 * @param {import('../models/User.js').User} targetUser
 * @param {import('../models/User.js').User} adminUser
 */
export function signImpersonationToken(targetUser, adminUser) {
  return jwt.sign(
    {
      sub: targetUser._id,
      tenantId: targetUser.tenantId,
      role: targetUser.role,
      imp: String(adminUser._id),
    },
    env.jwtSecret,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
}

/**
 * Read impersonator id from a decoded JWT payload.
 * @param {Record<string, unknown>} decoded
 */
export function getImpersonatorId(decoded) {
  return decoded?.imp ? String(decoded.imp) : null;
}
