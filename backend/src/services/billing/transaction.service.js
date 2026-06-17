import { Transaction } from '../../models/Transaction.js';

/**
 * Record a billing transaction idempotently by provider external id.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} [params.planId]
 * @param {'direct' | 'stripe' | 'razorpay'} params.provider
 * @param {string} params.externalId
 * @param {number} params.amountMinor
 * @param {string} params.currency
 * @param {'pending' | 'paid' | 'failed' | 'refunded'} params.status
 * @param {string} [params.description]
 * @param {Record<string, unknown>} [params.metadata]
 */
export async function recordTransaction({
  tenantId,
  planId,
  provider,
  externalId,
  amountMinor,
  currency,
  status,
  description = '',
  metadata = {},
}) {
  if (externalId) {
    const existing = await Transaction.findOne({ provider, externalId }).lean();
    if (existing) return existing;
  }

  return Transaction.create({
    tenantId,
    planId: planId || null,
    provider,
    externalId: externalId || '',
    amountMinor,
    currency,
    status,
    description,
    metadata,
  });
}

/**
 * List transactions for a tenant (newest first).
 * @param {string} tenantId
 * @param {number} [limit]
 */
export async function listTenantTransactions(tenantId, limit = 50) {
  return Transaction.find({ tenantId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * List all transactions for super admin.
 * @param {number} [limit]
 */
export async function listAllTransactions(limit = 100) {
  return Transaction.find()
    .populate('tenantId', 'name slug')
    .populate('planId', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
