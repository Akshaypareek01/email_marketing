import { env } from '../config/env.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thrown when a plan/trial limit blocks an action. `status` + `code` flow to the API. */
export class PlanLimitError extends Error {
  constructor(message, code, status = 403) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Resolve when a tenant's free trial ends. Uses the stamped `trialEndsAt`, else
 * derives it from account creation + the configured trial length (legacy tenants).
 * @param {object} tenant
 * @returns {Date}
 */
export function getTrialEndsAt(tenant) {
  const stamped = tenant?.subscription?.trialEndsAt;
  if (stamped) return new Date(stamped);
  const created = tenant?.createdAt ? new Date(tenant.createdAt) : new Date();
  return new Date(created.getTime() + env.trial.days * DAY_MS);
}

/** True once a tenant is on a paid, active plan. */
export function isOnPaidPlan(tenant) {
  const sub = tenant?.subscription || {};
  return sub.status === 'active' && Boolean(sub.planId);
}

/**
 * True when the free trial has ended and the tenant has not bought a plan.
 * Paid (active), past_due and canceled tenants are governed by billing state, not the trial clock.
 * @param {object} tenant
 */
export function isTrialExpired(tenant) {
  const sub = tenant?.subscription || {};
  if (sub.status !== 'trialing') return false;
  return Date.now() > getTrialEndsAt(tenant).getTime();
}

/** Whole days left in the trial (0 once expired). Null for non-trialing tenants. */
export function trialDaysLeft(tenant) {
  const sub = tenant?.subscription || {};
  if (sub.status !== 'trialing') return null;
  const ms = getTrialEndsAt(tenant).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

/**
 * Block the action when the trial has lapsed and no plan is purchased.
 * @param {object} tenant
 */
export function assertTrialActiveOrPaid(tenant) {
  if (isTrialExpired(tenant)) {
    throw new PlanLimitError(
      'Your free trial has ended. Choose a plan to continue.',
      'trial_expired',
      402
    );
  }
}

/**
 * Guard adding a domain: trial must be live (or plan bought), and the count must be
 * under the plan's `maxDomains` (0 = unlimited).
 * @param {object} tenant
 * @param {number} currentCount existing domain count for the tenant
 */
export function assertCanAddDomain(tenant, currentCount) {
  assertTrialActiveOrPaid(tenant);
  const max = tenant?.subscription?.maxDomains ?? 0;
  if (max > 0 && currentCount >= max) {
    throw new PlanLimitError(
      `Domain limit reached (${currentCount}/${max}). Upgrade your plan to add more domains.`,
      'domain_limit_reached'
    );
  }
}

/**
 * Guard adding a team member: trial live (or paid) and under the plan's `maxTeamUsers`.
 * @param {object} tenant
 * @param {number} currentCount existing user count for the tenant
 */
export function assertCanAddTeamUser(tenant, currentCount) {
  assertTrialActiveOrPaid(tenant);
  const max = tenant?.subscription?.maxTeamUsers ?? 0;
  if (max > 0 && currentCount >= max) {
    throw new PlanLimitError(
      `Team seat limit reached (${currentCount}/${max}). Upgrade your plan to add more members.`,
      'team_limit_reached'
    );
  }
}
