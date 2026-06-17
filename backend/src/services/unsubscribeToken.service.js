import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const PURPOSE = 'unsub';

/**
 * Create a signed unsubscribe token for an email + tenant pair.
 * @param {string} email
 * @param {string} tenantId
 * @returns {string}
 */
export function signUnsubscribeToken(email, tenantId) {
  return jwt.sign(
    {
      email: String(email).trim().toLowerCase(),
      tenantId: String(tenantId),
      purpose: PURPOSE,
    },
    env.jwtSecret,
    { expiresIn: '365d', algorithm: 'HS256' }
  );
}

/**
 * Verify and decode an unsubscribe token.
 * @param {string} token
 * @returns {{ email: string, tenantId: string }}
 */
export function verifyUnsubscribeToken(token) {
  const decoded = jwt.verify(String(token), env.jwtSecret, { algorithms: ['HS256'] });
  if (decoded.purpose !== PURPOSE) {
    throw new Error('Invalid unsubscribe token');
  }
  if (!decoded.email || !decoded.tenantId) {
    throw new Error('Invalid unsubscribe token payload');
  }
  return {
    email: String(decoded.email).trim().toLowerCase(),
    tenantId: String(decoded.tenantId),
  };
}
