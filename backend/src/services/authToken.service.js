import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/RefreshToken.js';

/**
 * Hash a raw token for storage.
 * @param {string} raw
 */
export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Issue a short-lived JWT access token.
 * @param {import('../models/User.js').User} user
 */
export function signAccessToken(user) {
  return jwt.sign(
    { sub: user._id, tenantId: user.tenantId, role: user.role },
    env.jwtSecret,
    { expiresIn: env.auth.accessExpiresIn, algorithm: 'HS256' }
  );
}

/**
 * Create and persist a refresh token; returns the raw value for the client.
 * @param {import('../models/User.js').User} user
 * @param {{ ip?: string, userAgent?: string }} meta
 */
export async function issueRefreshToken(user, meta = {}) {
  const raw = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + env.auth.refreshExpiresMs);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(raw),
    expiresAt,
    ip: meta.ip || '',
    userAgent: meta.userAgent || '',
  });

  return raw;
}

/**
 * Rotate refresh token and return new access + refresh pair.
 * @param {string} rawRefresh
 */
export async function rotateRefreshToken(rawRefresh) {
  const tokenHash = hashToken(rawRefresh);
  const stored = await RefreshToken.findOne({ tokenHash, revokedAt: null });
  if (!stored || stored.expiresAt < new Date()) {
    const err = new Error('Invalid or expired refresh token');
    err.status = 401;
    throw err;
  }

  stored.revokedAt = new Date();
  await stored.save();

  const { User } = await import('../models/User.js');
  const user = await User.findById(stored.userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }

  const accessToken = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user, { ip: stored.ip, userAgent: stored.userAgent });

  return { user, accessToken, refreshToken };
}

/**
 * Revoke a refresh token (logout).
 * @param {string} rawRefresh
 */
export async function revokeRefreshToken(rawRefresh) {
  if (!rawRefresh) return;
  const tokenHash = hashToken(rawRefresh);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
}

/**
 * Revoke all refresh tokens for a user (after password change).
 * @param {string} userId
 */
export async function revokeAllRefreshTokensForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}
