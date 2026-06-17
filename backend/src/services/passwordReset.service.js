import crypto from 'crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { hashToken, revokeAllRefreshTokensForUser } from './authToken.service.js';
import { sendPasswordResetEmail } from './transactionalEmail.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Request a password reset link (always returns success to avoid email enumeration).
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return { ok: true };
  }

  await PasswordResetToken.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.auth.passwordResetExpiresMs);

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(raw),
    expiresAt,
  });

  const resetUrl = `${env.appUrl.replace(/\/$/, '')}/reset-password?token=${raw}`;

  await sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    resetUrl,
  });

  // Never log the live reset URL/token — it is a single-use credential.
  logger.info({ tag: 'password-reset', email: user.email });

  // Only expose the URL out-of-band in non-production dev, never in production.
  return { ok: true, devResetUrl: env.isProduction ? undefined : resetUrl };
}

/**
 * Reset password using a valid token.
 * @param {string} rawToken
 * @param {string} newPassword
 */
export async function resetPassword(rawToken, newPassword) {
  const tokenHash = hashToken(rawToken);
  const record = await PasswordResetToken.findOne({ tokenHash, usedAt: null });
  if (!record || record.expiresAt < new Date()) {
    const err = new Error('Invalid or expired reset link');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(record.userId).select('+password');
  if (!user) {
    const err = new Error('Invalid or expired reset link');
    err.status = 400;
    throw err;
  }

  user.password = newPassword;
  await user.save();

  record.usedAt = new Date();
  await record.save();
  await revokeAllRefreshTokensForUser(user._id);

  return user;
}
