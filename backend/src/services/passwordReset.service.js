import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { hashToken, revokeAllRefreshTokensForUser } from './authToken.service.js';
import { sendPasswordResetEmail } from './transactionalEmail.service.js';
import { generateOtp, OTP_EXPIRES_MS, MAX_OTP_ATTEMPTS } from '../utils/otp.js';
import logger from '../middleware/logsCreate.js';

/**
 * Request a password-reset OTP (always returns success to avoid email enumeration).
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return { ok: true };
  }

  await PasswordResetToken.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash: hashToken(code),
    expiresAt,
  });

  await sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    code,
  });

  // Never log the live code — it is a single-use credential.
  logger.info({ tag: 'password-reset', email: user.email });

  // Only expose the code out-of-band in non-production dev, never in production.
  return { ok: true, devCode: env.isProduction ? undefined : code };
}

/**
 * Reset a password using an emailed OTP code.
 * @param {string} email
 * @param {string} code
 * @param {string} newPassword
 */
export async function resetPasswordWithCode(email, code, newPassword) {
  const invalid = () => {
    const err = new Error('Invalid or expired reset code');
    err.status = 400;
    return err;
  };

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
  if (!user) throw invalid();

  const record = await PasswordResetToken.findOne({ userId: user._id, usedAt: null }).sort({
    createdAt: -1,
  });

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

  user.password = newPassword;
  await user.save();

  record.usedAt = new Date();
  await record.save();
  await revokeAllRefreshTokensForUser(user._id);

  return user;
}
