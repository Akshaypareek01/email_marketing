import { Tenant } from '../models/Tenant.js';
import { Plan } from '../models/Plan.js';

/**
 * Total send quota including one-time add-on packs for the current period.
 * @param {object} [sub]
 */
export function getEffectiveQuota(sub = {}) {
  return (sub.monthlyEmailQuota ?? 0) + (sub.quotaBonusThisPeriod ?? 0);
}

/**
 * Apply a plan snapshot to a tenant subscription (used by direct billing or webhook success).
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 * @param {import('mongoose').Types.ObjectId | string} planId
 * @param {{ status?: 'trialing' | 'active' | 'past_due' | 'canceled', preserveUsage?: boolean }} opts
 */
export async function applyPlanToTenant(tenantId, planId, opts = {}) {
  const plan = await Plan.findById(planId);
  if (!plan || !plan.isActive) {
    const err = new Error('Plan not found or inactive');
    err.status = 404;
    throw err;
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  tenant.subscription.planId = plan._id;
  tenant.subscription.status = opts.status || 'active';
  tenant.subscription.monthlyEmailQuota = plan.monthlyEmailQuota;
  tenant.subscription.maxDomains = plan.maxDomains;
  tenant.subscription.maxContacts = plan.maxContacts;
  tenant.subscription.maxTeamUsers = plan.maxTeamUsers;

  if (!opts.preserveUsage) {
    tenant.subscription.periodStart = new Date();
    tenant.subscription.emailsSentThisPeriod = 0;
    tenant.subscription.quotaBonusThisPeriod = 0;
  }

  await tenant.save();
  return { tenant, plan };
}

/**
 * Reset quota counter on subscription renewal (billing webhooks).
 * @param {import('mongoose').Types.ObjectId | string} tenantId
 */
export async function resetQuotaOnRenewal(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return null;
  tenant.subscription.periodStart = new Date();
  tenant.subscription.emailsSentThisPeriod = 0;
  tenant.subscription.quotaBonusThisPeriod = 0;
  tenant.subscription.status = 'active';
  await tenant.save();
  return tenant;
}
