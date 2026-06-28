import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ensureTenantConfigSet } from '../services/sesConfigSet.service.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/authToken.service.js';
import { requestPasswordReset, resetPasswordWithCode } from '../services/passwordReset.service.js';
import { issueEmailVerification, verifyEmailWithCode } from '../services/emailVerification.service.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Build auth response payload with access + refresh tokens.
 * @param {import('../models/User.js').User} user
 * @param {import('express').Request} req
 * @param {import('../models/Tenant.js').Tenant} [tenant]
 */
async function authPayload(user, req, tenant) {
  const ctx = auditContext(req, user);
  const token = signAccessToken(user);
  const refreshToken = await issueRefreshToken(user, {
    ip: ctx.ip,
    userAgent: req.headers['user-agent'] || '',
  });

  const body = {
    token,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      emailVerified: Boolean(user.emailVerified),
    },
  };

  if (tenant) {
    body.tenant = { id: tenant._id, name: tenant.name, slug: tenant.slug };
  }

  return body;
}

export async function register(req, res, next) {
  try {
    const { name, email, password, tenantName, phoneCountryCode, phone } = req.body;

    const slug = tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const trialEndsAt = new Date(Date.now() + env.trial.days * 24 * 60 * 60 * 1000);
    const tenant = await Tenant.create({
      name: tenantName,
      slug,
      subscription: { trialEndsAt },
    });
    const user = await User.create({
      name,
      email,
      password,
      phoneCountryCode,
      phone,
      tenantId: tenant._id,
      role: 'admin',
    });

    ensureTenantConfigSet(String(tenant._id)).catch((err) => {
      logger.warn({ tag: 'ses-config-set', tenantId: tenant._id, error: err.message });
    });

    const verification = await issueEmailVerification(user);

    await writeAuditLog({
      ...auditContext(req, user),
      action: 'auth.register',
      targetType: 'tenant',
      targetId: String(tenant._id),
      metadata: { tenantName },
    });

    const payload = await authPayload(user, req, tenant);
    res.status(201).json({ ...payload, devVerifyCode: verification.devCode });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      await writeAuditLog({
        ...auditContext(req),
        action: 'auth.login_failed',
        metadata: { email },
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await writeAuditLog({
      ...auditContext(req, user),
      action: 'auth.login',
    });

    const payload = await authPayload(user, req);
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'refreshToken is required' });
    }

    const { user, accessToken, refreshToken: newRefresh } = await rotateRefreshToken(refreshToken);

    res.json({
      token: accessToken,
      refreshToken: newRefresh,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        emailVerified: Boolean(user.emailVerified),
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

export async function resendVerification(req, res, next) {
  try {
    if (req.user.emailVerified) {
      return res.json({ message: 'Email is already verified.' });
    }
    const verification = await issueEmailVerification(req.user);
    res.json({
      message: 'Verification code sent.',
      devVerifyCode: verification.devCode,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'code is required' });
    const user = await verifyEmailWithCode(req.user, code);
    await writeAuditLog({
      ...auditContext(req, user),
      action: 'auth.email_verified',
      targetType: 'user',
      targetId: String(user._id),
    });
    res.json({ message: 'Email verified successfully.', email: user.email });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    await revokeRefreshToken(req.body?.refreshToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);

    await writeAuditLog({
      ...auditContext(req),
      action: 'auth.forgot_password',
      metadata: { email },
    });

    res.json({
      message: 'If an account exists for that email, a reset code has been sent.',
      devResetCode: result.devCode,
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req, res, next) {
  try {
    const { email, code, password } = req.body;
    const user = await resetPasswordWithCode(email, code, password);

    await writeAuditLog({
      ...auditContext(req, user),
      action: 'auth.password_reset',
      targetType: 'user',
      targetId: String(user._id),
    });

    res.json({ message: 'Password updated. Please sign in with your new password.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: req.user });
}
