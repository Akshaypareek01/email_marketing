import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { EmailVerificationToken } from '../models/EmailVerificationToken.js';
import { hashToken } from './authToken.service.js';
import { sendVerificationEmail } from './transactionalEmail.service.js';
import { generateOtp, OTP_EXPIRES_MS, MAX_OTP_ATTEMPTS } from '../utils/otp.js';
import logger from '../middleware/logsCreate.js';

/**
 * Issue an email-verification OTP for a user (invalidates prior unused codes).
 * @param {import('../models/User.js').User} user
 */
export async function issueEmailVerification(user) {
  await EmailVerificationToken.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);

  await EmailVerificationToken.create({
    userId: user._id,
    tokenHash: hashToken(code),
    expiresAt,
  });

  await sendVerificationEmail({
    email: user.email,
    name: user.name,
    code,
  });

  // Never log the live code.
  logger.info({ tag: 'email-verify', email: user.email });

  // Only expose the code out-of-band in non-production dev, never in production.
  return { devCode: env.isProduction ? undefined : code };
}

/**
 * Mark a user's email verified using a 6-digit OTP code.
 * @param {import('../models/User.js').User} user
 * @param {string} code
 */
export async function verifyEmailWithCode(user, code) {
  if (user.emailVerified) return user;

  const record = await EmailVerificationToken.findOne({ userId: user._id, usedAt: null }).sort({
    createdAt: -1,
  });

  const invalid = () => {
    const err = new Error('Invalid or expired verification code');
    err.status = 400;
    return err;
  };

  if (!record || record.expiresAt < new Date()) throw invalid();

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    record.usedAt = new Date();
    await record.save();
    const err = new Error('Too many incorrect attempts. Request a new code.');
    err.status = 429;
    throw err;
  }

  if (record.tokenHash !== hashToken(String(code).trim())) {
    record.attempts += 1;
    await record.save();
    throw invalid();
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
