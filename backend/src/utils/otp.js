import crypto from 'crypto';

/** OTP codes are valid for 10 minutes after issue. */
export const OTP_EXPIRES_MS = 10 * 60 * 1000;

/** Maximum wrong guesses allowed against a single code before it is burned. */
export const MAX_OTP_ATTEMPTS = 5;

/** Number of digits in an OTP code. */
export const OTP_LENGTH = 6;

/**
 * Generate a cryptographically-random numeric OTP code, zero-padded to OTP_LENGTH.
 * @returns {string} e.g. "048213"
 */
export function generateOtp() {
  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, '0');
}
