import { env } from '../config/env.js';
import { sendEmail } from './ses.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Send a platform transactional email (verify, reset) via SES when configured.
 * Falls back to debug log when PLATFORM_FROM_EMAIL is unset.
 * @param {{ to: string, subject: string, html: string, text?: string }} params
 */
export async function sendTransactionalEmail({ to, subject, html, text }) {
  const from = env.transactional.fromEmail;
  if (!from) {
    logger.info({ tag: 'transactional-email', skipped: true, to, subject });
    return { skipped: true };
  }

  const fromAddress = env.transactional.fromName
    ? `${env.transactional.fromName} <${from}>`
    : from;

  try {
    const result = await sendEmail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    logger.info({ tag: 'transactional-email', to, subject, messageId: result.messageId });
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    logger.error({ tag: 'transactional-email', to, subject, error: err.message });
    return { sent: false, error: err.message };
  }
}

/** Inline style for the large OTP code block shown in transactional emails. */
const OTP_STYLE =
  'font-size:30px;font-weight:700;letter-spacing:8px;font-family:monospace;margin:16px 0';

/**
 * Send an email-verification OTP code.
 * @param {{ email: string, name?: string, code: string }} params
 */
export async function sendVerificationEmail({ email, name, code }) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return sendTransactionalEmail({
    to: email,
    subject: 'Your Mail Box verification code',
    html: `
      <p>${greeting}</p>
      <p>Enter this code to confirm your email address and unlock sending and campaigns:</p>
      <p style="${OTP_STYLE}">${code}</p>
      <p style="color:#666;font-size:12px">This code expires in 10 minutes. If you did not create an account, ignore this message.</p>
    `,
    text: `${greeting}\n\nYour verification code is ${code}. It expires in 10 minutes.`,
  });
}

/**
 * Send a password-reset OTP code.
 * @param {{ email: string, name?: string, code: string }} params
 */
export async function sendPasswordResetEmail({ email, name, code }) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return sendTransactionalEmail({
    to: email,
    subject: 'Your Mail Box password reset code',
    html: `
      <p>${greeting}</p>
      <p>We received a request to reset your password. Enter this code to continue:</p>
      <p style="${OTP_STYLE}">${code}</p>
      <p style="color:#666;font-size:12px">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
    `,
    text: `${greeting}\n\nYour password reset code is ${code}. It expires in 10 minutes.`,
  });
}
