import { Transaction } from '../models/Transaction.js';
import { Tenant } from '../models/Tenant.js';
import { Plan } from '../models/Plan.js';
import { User } from '../models/User.js';

/**
 * Compute MRR and revenue metrics for super-admin dashboard.
 */
export async function getAdminAnalytics() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [activeSubs, pastDue, canceled, paidThisMonth, paidPrevMonth, plans] = await Promise.all([
    Tenant.countDocuments({ 'subscription.status': 'active' }),
    Tenant.countDocuments({ 'subscription.status': 'past_due' }),
    Tenant.countDocuments({ 'subscription.status': 'canceled' }),
    Transaction.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: prevMonthStart, $lt: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Plan.find({ isActive: true }).select('_id name priceMinor currency interval').lean(),
  ]);

  const planMap = Object.fromEntries(plans.map((p) => [String(p._id), p]));

  const activeTenants = await Tenant.find({ 'subscription.status': 'active', 'subscription.planId': { $ne: null } })
    .select('subscription.planId createdAt')
    .lean();

  let mrrMinor = 0;
  for (const t of activeTenants) {
    const plan = planMap[String(t.subscription.planId)];
    if (!plan) continue;
    const monthly = plan.interval === 'year' ? Math.round(plan.priceMinor / 12) : plan.priceMinor;
    mrrMinor += monthly;
  }

  const cohortStart = new Date(now);
  cohortStart.setDate(cohortStart.getDate() - 30);

  const [newTenants, newUsers] = await Promise.all([
    Tenant.countDocuments({ createdAt: { $gte: cohortStart } }),
    User.countDocuments({ createdAt: { $gte: cohortStart }, role: { $ne: 'super_admin' } }),
  ]);

  const revenueThisMonth = paidThisMonth[0]?.total ?? 0;
  const revenuePrevMonth = paidPrevMonth[0]?.total ?? 0;

  return {
    mrrMinor,
    currency: 'INR',
    subscriptions: { active: activeSubs, pastDue, canceled },
    revenue: {
      thisMonthMinor: revenueThisMonth,
      prevMonthMinor: revenuePrevMonth,
      txCountThisMonth: paidThisMonth[0]?.count ?? 0,
    },
    cohort30d: { newTenants, newUsers },
  };
}

/**
 * Currency-correct revenue breakdown: lifetime + this-month + last-12-months, with
 * refunds subtracted, grouped by currency (never summed across mixed currencies).
 */
export async function getRevenueBreakdown() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [paidLifetime, refundedLifetime, paidThisMonth, byMonth] = await Promise.all([
    Transaction.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: '$currency', grossMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: '$currency', refundedMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: monthStart } } },
      { $group: { _id: '$currency', grossMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: yearAgo } } },
      {
        $group: {
          _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, currency: '$currency' },
          grossMinor: { $sum: '$amountMinor' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
  ]);

  const refundMap = Object.fromEntries(refundedLifetime.map((r) => [r._id, r.refundedMinor]));

  const lifetimeByCurrency = paidLifetime.map((p) => ({
    currency: p._id || 'INR',
    grossMinor: p.grossMinor,
    refundedMinor: refundMap[p._id] || 0,
    netMinor: p.grossMinor - (refundMap[p._id] || 0),
    count: p.count,
  }));

  const thisMonthByCurrency = paidThisMonth.map((p) => ({
    currency: p._id || 'INR',
    grossMinor: p.grossMinor,
    count: p.count,
  }));

  const byMonthSeries = byMonth.map((m) => ({
    month: m._id.month,
    currency: m._id.currency || 'INR',
    grossMinor: m.grossMinor,
    count: m.count,
  }));

  return { lifetimeByCurrency, thisMonthByCurrency, byMonth: byMonthSeries };
}

/**
 * Plan distribution: active tenants per plan + per-plan revenue (lifetime + this month).
 */
export async function getPlanDistribution() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [plans, tenantsPerPlan, revPerPlanLifetime, revPerPlanMonth] = await Promise.all([
    Plan.find().select('_id name priceMinor currency interval isActive').lean(),
    Tenant.aggregate([
      { $match: { 'subscription.status': 'active', 'subscription.planId': { $ne: null } } },
      { $group: { _id: '$subscription.planId', tenants: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'paid', planId: { $ne: null } } },
      { $group: { _id: '$planId', grossMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { status: 'paid', planId: { $ne: null }, createdAt: { $gte: monthStart } } },
      { $group: { _id: '$planId', grossMinor: { $sum: '$amountMinor' } } },
    ]),
  ]);

  const tenantsMap = Object.fromEntries(tenantsPerPlan.map((t) => [String(t._id), t.tenants]));
  const lifetimeMap = Object.fromEntries(revPerPlanLifetime.map((r) => [String(r._id), r]));
  const monthMap = Object.fromEntries(revPerPlanMonth.map((r) => [String(r._id), r.grossMinor]));

  return plans.map((p) => ({
    planId: String(p._id),
    name: p.name,
    priceMinor: p.priceMinor,
    currency: p.currency || 'INR',
    interval: p.interval,
    isActive: p.isActive,
    activeTenants: tenantsMap[String(p._id)] || 0,
    lifetimeRevenueMinor: lifetimeMap[String(p._id)]?.grossMinor || 0,
    lifetimePurchases: lifetimeMap[String(p._id)]?.count || 0,
    thisMonthRevenueMinor: monthMap[String(p._id)] || 0,
  }));
}

/**
 * Top customers (tenants) ranked by net paid revenue.
 * @param {number} [limit=10]
 */
export async function getTopCustomers(limit = 10) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 10));

  const [paid, refunded] = await Promise.all([
    Transaction.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: { tenantId: '$tenantId', currency: '$currency' },
          grossMinor: { $sum: '$amountMinor' },
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { status: 'refunded' } },
      { $group: { _id: { tenantId: '$tenantId', currency: '$currency' }, refundedMinor: { $sum: '$amountMinor' } } },
    ]),
  ]);

  const refundMap = new Map(refunded.map((r) => [`${r._id.tenantId}|${r._id.currency}`, r.refundedMinor]));

  // Net revenue per tenant (keep the dominant currency for display).
  const byTenant = new Map();
  for (const row of paid) {
    const tid = String(row._id.tenantId);
    const key = `${row._id.tenantId}|${row._id.currency}`;
    const net = row.grossMinor - (refundMap.get(key) || 0);
    const existing = byTenant.get(tid) || { tenantId: tid, netMinor: 0, purchases: 0, currency: row._id.currency || 'INR' };
    existing.netMinor += net;
    existing.purchases += row.count;
    byTenant.set(tid, existing);
  }

  const ranked = [...byTenant.values()].sort((a, b) => b.netMinor - a.netMinor).slice(0, lim);

  const tenants = await Tenant.find({ _id: { $in: ranked.map((r) => r.tenantId) } })
    .select('name slug subscription.planId status createdAt')
    .lean();
  const tenantMap = Object.fromEntries(tenants.map((t) => [String(t._id), t]));

  return ranked.map((r, i) => ({
    rank: i + 1,
    tenantId: r.tenantId,
    name: tenantMap[r.tenantId]?.name || '(deleted tenant)',
    slug: tenantMap[r.tenantId]?.slug || '',
    status: tenantMap[r.tenantId]?.status || 'unknown',
    netRevenueMinor: r.netMinor,
    currency: r.currency,
    purchases: r.purchases,
  }));
}
