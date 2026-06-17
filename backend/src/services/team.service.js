import crypto from 'crypto';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { issueRefreshToken } from './authToken.service.js';
import { signImpersonationToken } from './impersonate.service.js';
import { writeAuditLog, auditContext } from './audit.service.js';
import { sendTransactionalEmail } from './transactionalEmail.service.js';
import { env } from '../config/env.js';

/**
 * Invite a team member to a tenant (Tenant Admin only).
 * @param {import('../models/User.js').User} inviter
 * @param {{ email: string, name: string, role?: 'user' | 'admin' }} body
 */
export async function inviteTeamMember(inviter, { email, name, role = 'user' }) {
  const tenant = await Tenant.findById(inviter.tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const maxUsers = tenant.subscription?.maxTeamUsers ?? 1;
  const userCount = await User.countDocuments({ tenantId: tenant._id });
  if (userCount >= maxUsers) {
    const err = new Error(`Team user limit reached (${maxUsers}). Upgrade your plan.`);
    err.status = 403;
    throw err;
  }

  const normalized = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const user = await User.create({
    name: name.trim(),
    email: normalized,
    password: tempPassword,
    tenantId: tenant._id,
    role: role === 'admin' ? 'admin' : 'user',
    emailVerified: true,
  });

  const loginUrl = `${env.appUrl.replace(/\/$/, '')}/login`;
  await sendTransactionalEmail({
    to: user.email,
    subject: `You've been invited to ${tenant.name} on Mail Box`,
    html: `
      <p>Hi ${user.name},</p>
      <p>${inviter.name} invited you to join <strong>${tenant.name}</strong>.</p>
      <p>Sign in at <a href="${loginUrl}">${loginUrl}</a></p>
      <p>Temporary password: <code>${tempPassword}</code></p>
      <p>Change your password after first login.</p>
    `,
    text: `Invited to ${tenant.name}. Login: ${loginUrl} Temp password: ${tempPassword}`,
  });

  // Temp password is delivered ONLY via email — never returned in the API response
  // (except in non-production dev to ease local testing).
  return { user, tempPassword: env.isProduction ? undefined : tempPassword };
}

/**
 * Build impersonation auth payload for a tenant's primary admin.
 * @param {import('express').Request} req
 * @param {string} tenantId
 */
export async function impersonateTenantAdmin(req, tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const targetUser = await User.findOne({ tenantId, role: 'admin' }).sort({ createdAt: 1 });
  if (!targetUser) {
    const err = new Error('No admin user found for tenant');
    err.status = 404;
    throw err;
  }

  const token = signImpersonationToken(targetUser, req.user);
  const refreshToken = await issueRefreshToken(req.user, {
    ip: auditContext(req).ip,
    userAgent: req.headers['user-agent'] || '',
  });

  await writeAuditLog({
    ...auditContext(req),
    tenantId: tenant._id,
    action: 'admin.impersonate',
    targetType: 'user',
    targetId: String(targetUser._id),
    metadata: { tenantName: tenant.name, targetEmail: targetUser.email },
  });

  return {
    token,
    refreshToken,
    impersonating: true,
    impersonatorId: String(req.user._id),
    user: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role,
      tenantId: targetUser.tenantId,
      emailVerified: Boolean(targetUser.emailVerified),
    },
    tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug },
  };
}
