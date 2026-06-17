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

/**
 * Send email verification link.
 * @param {{ email: string, name?: string, verifyUrl: string }} params
 */
export async function sendVerificationEmail({ email, name, verifyUrl }) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return sendTransactionalEmail({
    to: email,
    subject: 'Verify your Mail Box email',
    html: `
      <p>${greeting}</p>
      <p>Confirm your email address to unlock sending and campaigns.</p>
      <p><a href="${verifyUrl}">Verify email</a></p>
      <p style="color:#666;font-size:12px">If you did not create an account, ignore this message.</p>
    `,
    text: `${greeting}\n\nVerify your email: ${verifyUrl}`,
  });
}

/**
 * Send password reset link.
 * @param {{ email: string, name?: string, resetUrl: string }} params
 */
export async function sendPasswordResetEmail({ email, name, resetUrl }) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return sendTransactionalEmail({
    to: email,
    subject: 'Reset your Mail Box password',
    html: `
      <p>${greeting}</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p style="color:#666;font-size:12px">This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
    text: `${greeting}\n\nReset your password: ${resetUrl}`,
  });
}
