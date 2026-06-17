import { Tenant } from '../models/Tenant.js';
import { Plan } from '../models/Plan.js';
import { getBillingConfig } from './platformBillingSettings.service.js';
import { getBillingProvider } from './billing/index.js';
import { applyPlanToTenant } from './subscription.service.js';

/**
 * Resolve upgrade / downgrade / lateral when changing plans.
 * @param {import('../models/Plan.js').Plan | null} current
 * @param {import('../models/Plan.js').Plan} next
 */
function planDirection(current, next) {
  if (!current) return 'upgrade';
  if (next.priceMinor > current.priceMinor) return 'upgrade';
  if (next.priceMinor < current.priceMinor) return 'downgrade';
  return 'lateral';
}

/**
 * Change tenant subscription plan with provider proration when configured.
 * @param {string} tenantId
 * @param {string} newPlanId
 */
export async function changeTenantPlan(tenantId, newPlanId) {
  const [tenant, newPlan] = await Promise.all([
    Tenant.findById(tenantId),
    Plan.findById(newPlanId),
  ]);

  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  if (!newPlan || !newPlan.isActive) {
    const err = new Error('Plan not found or inactive');
    err.status = 404;
    throw err;
  }

  const currentPlan = tenant.subscription?.planId
    ? await Plan.findById(tenant.subscription.planId)
    : null;

  if (currentPlan && String(currentPlan._id) === String(newPlanId)) {
    const err = new Error('Already on this plan');
    err.status = 400;
    throw err;
  }

  const direction = planDirection(currentPlan, newPlan);
  const billingConfig = await getBillingConfig();

  if (billingConfig.mode === 'provider') {
    const billingProvider = await getBillingProvider();
    const result = await billingProvider.changeSubscriptionPlan(tenantId, newPlanId, { direction });
    if (result.checkoutUrl) {
      return { mode: 'redirect', direction, ...result };
    }
    return {
      mode: 'updated',
      direction,
      message: result.message || `Plan changed (${direction}).`,
      subscription: result.subscription,
    };
  }

  await applyPlanToTenant(tenantId, newPlanId, {
    status: 'active',
    preserveUsage: direction === 'downgrade',
  });

  const messages = {
    upgrade: `Upgraded to ${newPlan.name}. Quota reset to new plan limits.`,
    downgrade: `Downgraded to ${newPlan.name}. New limits apply; usage counter kept until period reset.`,
    lateral: `Switched to ${newPlan.name}.`,
  };

  return {
    mode: 'direct',
    direction,
    message: messages[direction],
    subscription: {
      planId: newPlan._id,
      planName: newPlan.name,
      monthlyEmailQuota: newPlan.monthlyEmailQuota,
    },
  };
}
