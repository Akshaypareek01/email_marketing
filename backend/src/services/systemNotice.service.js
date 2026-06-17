import { env } from '../config/env.js';
import { SystemNotice } from '../models/SystemNotice.js';
import { isPlatformSendingHalted } from './platformSettings.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Upsert a deduplicated system notice for a tenant.
 * Reactivates and clears dismissals when the message changes.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.dedupeKey
 * @param {string} params.title
 * @param {string} params.message
 * @param {'info'|'warning'|'danger'} [params.severity]
 * @param {'sending'|'billing'|'account'|'maintenance'|'admin'} [params.category]
 * @param {string} [params.actionHref]
 * @param {string} [params.actionLabel]
 */
export async function upsertSystemNotice({
  tenantId,
  dedupeKey,
  title,
  message,
  severity = 'warning',
  category = 'admin',
  actionHref = '',
  actionLabel = '',
}) {
  try {
    const existing = dedupeKey
      ? await SystemNotice.findOne({ tenantId, dedupeKey })
      : null;

    if (existing) {
      const messageChanged = existing.message !== message || existing.title !== title;
      existing.title = title;
      existing.message = message;
      existing.severity = severity;
      existing.category = category;
      existing.actionHref = actionHref;
      existing.actionLabel = actionLabel;
      existing.active = true;
      existing.expiresAt = null;
      if (messageChanged) existing.dismissedBy = [];
      await existing.save();
      return existing;
    }

    return SystemNotice.create({
      tenantId,
      dedupeKey,
      title,
      message,
      severity,
      category,
      actionHref,
      actionLabel,
      active: true,
    });
  } catch (err) {
    logger.error({ tag: 'system-notice', tenantId, dedupeKey, error: err.message });
    return null;
  }
}

/**
 * Create a one-off admin notice (no dedupe key).
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.title
 * @param {string} params.message
 * @param {'info'|'warning'|'danger'} [params.severity]
 */
export async function createAdminNotice({ tenantId, title, message, severity = 'info' }) {
  return SystemNotice.create({
    tenantId,
    title,
    message,
    severity,
    category: 'admin',
    active: true,
  });
}

/**
 * Deactivate a deduplicated notice when its condition clears.
 * @param {string} tenantId
 * @param {string} dedupeKey
 */
export async function deactivateSystemNotice(tenantId, dedupeKey) {
  await SystemNotice.updateMany({ tenantId, dedupeKey, active: true }, { $set: { active: false } });
}

/**
 * List active notices for a tenant user (excluding dismissed).
 * @param {string} tenantId
 * @param {string} userId
 */
export async function listActiveNotices(tenantId, userId) {
  const now = new Date();
  return SystemNotice.find({
    tenantId,
    active: true,
    dismissedBy: { $ne: userId },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

/**
 * Dismiss a notice for the current user.
 * @param {string} noticeId
 * @param {string} tenantId
 * @param {string} userId
 */
export async function dismissNotice(noticeId, tenantId, userId) {
  const notice = await SystemNotice.findOneAndUpdate(
    { _id: noticeId, tenantId, active: true, dismissedBy: { $ne: userId } },
    { $addToSet: { dismissedBy: userId } },
    { new: true }
  );
  if (!notice) {
    const err = new Error('Notice not found');
    err.status = 404;
    throw err;
  }
  return notice;
}

/**
 * Sync derived notices from current tenant + platform state.
 * @param {import('../models/Tenant.js').Tenant} tenant
 */
export async function syncDerivedNotices(tenant) {
  const tenantId = String(tenant._id);

  if (await isPlatformSendingHalted()) {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'platform_halt',
      title: 'Platform maintenance',
      message: 'Outbound sending is temporarily halted platform-wide. Your queued campaigns will resume once maintenance completes.',
      severity: 'danger',
      category: 'maintenance',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'platform_halt');
  }

  if (tenant.status === 'suspended') {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'account_suspended',
      title: 'Account suspended',
      message: 'Your account has been suspended. Contact support for assistance.',
      severity: 'danger',
      category: 'account',
      actionHref: '/dashboard/support',
      actionLabel: 'Contact support',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'account_suspended');
  }

  if (tenant.status === 'restricted') {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'account_restricted',
      title: 'Account restricted',
      message: tenant.sending?.pauseReason || 'Sending restricted due to deliverability issues.',
      severity: 'danger',
      category: 'account',
      actionHref: '/dashboard/support',
      actionLabel: 'Contact support',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'account_restricted');
  }

  if (tenant.sending?.paused) {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'sending_paused',
      title: 'Sending paused',
      message: tenant.sending.pauseReason || 'Sending is paused for this account.',
      severity: 'danger',
      category: 'sending',
      actionHref: '/dashboard/support',
      actionLabel: 'Contact support',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'sending_paused');
  }

  const subStatus = tenant.subscription?.status;
  if (subStatus === 'past_due') {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'billing_past_due',
      title: 'Payment past due',
      message: 'Your subscription payment failed. Update billing to resume sending.',
      severity: 'warning',
      category: 'billing',
      actionHref: '/dashboard/billing',
      actionLabel: 'Update billing',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'billing_past_due');
  }

  if (subStatus === 'canceled') {
    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'billing_canceled',
      title: 'Subscription canceled',
      message: 'Your subscription is canceled. Choose a plan to send email again.',
      severity: 'warning',
      category: 'billing',
      actionHref: '/dashboard/billing',
      actionLabel: 'View plans',
    });
  } else {
    await deactivateSystemNotice(tenantId, 'billing_canceled');
  }
}

/**
 * Create a reputation auto-pause notice immediately after guardrails fire.
 * @param {string} tenantId
 * @param {string} reason
 */
export async function notifySendingAutoPaused(tenantId, reason) {
  const fullReason = `${reason} Sending auto-paused to protect platform deliverability.`;
  await upsertSystemNotice({
    tenantId,
    dedupeKey: 'sending_paused',
    title: 'Sending auto-paused',
    message: fullReason,
    severity: 'danger',
    category: 'sending',
    actionHref: '/dashboard/support',
    actionLabel: 'Contact support',
  });
}
