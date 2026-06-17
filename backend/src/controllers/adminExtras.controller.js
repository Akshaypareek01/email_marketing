import { impersonateTenantAdmin } from '../services/team.service.js';
import {
  getAdminAnalytics,
  getRevenueBreakdown,
  getPlanDistribution,
  getTopCustomers,
} from '../services/adminAnalytics.service.js';
import { syncAwsAccountSuppressionList } from '../services/sesSuppressionSync.service.js';
import { CANNED_RESPONSES } from '../constants/cannedResponses.js';

/**
 * Impersonate a tenant admin (audited, 1h token).
 */
export async function impersonateTenant(req, res, next) {
  try {
    const payload = await impersonateTenantAdmin(req, req.params.id);
    res.json(payload);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Super-admin revenue and cohort analytics.
 */
export async function adminAnalytics(req, res, next) {
  try {
    const analytics = await getAdminAnalytics();
    res.json({ analytics });
  } catch (err) {
    next(err);
  }
}

/**
 * Super-admin: currency-correct revenue breakdown (lifetime/month/12-month, net of refunds).
 */
export async function adminRevenue(req, res, next) {
  try {
    const revenue = await getRevenueBreakdown();
    res.json({ revenue });
  } catch (err) {
    next(err);
  }
}

/**
 * Super-admin: plan distribution + per-plan revenue.
 */
export async function adminPlanDistribution(req, res, next) {
  try {
    const plans = await getPlanDistribution();
    res.json({ plans });
  } catch (err) {
    next(err);
  }
}

/**
 * Super-admin: top customers ranked by net paid revenue.
 */
export async function adminTopCustomers(req, res, next) {
  try {
    const customers = await getTopCustomers(req.query.limit);
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

/**
 * Trigger AWS account suppression list sync.
 */
export async function syncSuppressions(req, res, next) {
  try {
    const result = await syncAwsAccountSuppressionList();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * List canned support responses.
 */
export async function listCannedResponses(req, res) {
  res.json({ responses: CANNED_RESPONSES });
}
