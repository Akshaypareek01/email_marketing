import { Tenant } from '../models/Tenant.js';
import { getBillingConfig } from '../services/platformBillingSettings.service.js';
import { upsertSystemNotice, deactivateSystemNotice } from '../services/systemNotice.service.js';
import logger from '../middleware/logsCreate.js';

const GRACE_MS = (Number(process.env.BILLING_GRACE_DAYS) || 7) * 24 * 60 * 60 * 1000;

/**
 * Suspend tenants that remain past_due beyond the grace period.
 */
export async function processBillingGracePeriod() {
  const billingConfig = await getBillingConfig();
  if (billingConfig.mode === 'direct') return 0;

  const cutoff = new Date(Date.now() - GRACE_MS);
  const tenants = await Tenant.find({
    'subscription.status': 'past_due',
    updatedAt: { $lte: cutoff },
    status: 'active',
  });

  for (const tenant of tenants) {
    tenant.status = 'suspended';
    await tenant.save();
    await upsertSystemNotice({
      tenantId: tenant._id,
      dedupeKey: 'account_suspended',
      title: 'Account suspended — payment overdue',
      message: `Payment has been past due for over ${Math.round(GRACE_MS / 86400000)} days. Update billing to restore access.`,
      severity: 'danger',
      category: 'billing',
      actionHref: '/dashboard/billing',
      actionLabel: 'Update billing',
    });
    logger.info({ tag: 'billing-grace', tenantId: tenant._id, message: 'Suspended past_due tenant' });
  }

  return tenants.length;
}

/**
 * Start hourly billing grace checker in API process.
 */
export function startBillingGraceJob() {
  const run = async () => {
    const billingConfig = await getBillingConfig();
    if (billingConfig.mode === 'direct') return;
    processBillingGracePeriod().catch((err) => {
      logger.error({ tag: 'billing-grace', error: err.message });
    });
  };
  run();
  setInterval(run, 60 * 60 * 1000);
}
