import crypto from 'crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { EmailVerificationToken } from '../models/EmailVerificationToken.js';
import { hashToken } from './authToken.service.js';
import { sendVerificationEmail } from './transactionalEmail.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Issue a verification token for a user (invalidates prior unused tokens).
 * @param {import('../models/User.js').User} user
 */
export async function issueEmailVerification(user) {
  await EmailVerificationToken.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.auth.emailVerificationExpiresMs);

  await EmailVerificationToken.create({
    userId: user._id,
    tokenHash: hashToken(raw),
    expiresAt,
  });

  const verifyUrl = `${env.appUrl.replace(/\/$/, '')}/verify-email?token=${raw}`;

  await sendVerificationEmail({
    email: user.email,
    name: user.name,
    verifyUrl,
  });

  // Never log the live verification URL/token.
  logger.info({ tag: 'email-verify', email: user.email });

  return { verifyUrl, devVerifyUrl: env.isProduction ? undefined : verifyUrl };
}

/**
 * Mark a user's email verified using a token.
 * @param {string} rawToken
 */
export async function verifyEmailWithToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const record = await EmailVerificationToken.findOne({ tokenHash, usedAt: null });
  if (!record || record.expiresAt < new Date()) {
    const err = new Error('Invalid or expired verification link');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(record.userId);
  if (!user) {
    const err = new Error('Invalid or expired verification link');
    err.status = 400;
    throw err;
  }

  user.emailVerified = true;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  return user;
}

/**
 * Assert the user has verified email when enforcement is enabled.
 * @param {import('../models/User.js').User} user
 */
export function assertEmailVerified(user) {
  if (!env.auth.requireEmailVerification) return;
  if (user.role === 'super_admin') return;
  if (!user.emailVerified) {
    const err = new Error('Verify your email before sending email or running campaigns.');
    err.status = 403;
    err.code = 'email_not_verified';
    throw err;
  }
}
