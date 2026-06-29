import { getQuotaAddonPack, QUOTA_ADDON_PACKS } from '../constants/quotaAddonPacks.js';
import { Tenant } from '../models/Tenant.js';
import { Transaction } from '../models/Transaction.js';
import { recordTransaction } from './billing/transaction.service.js';
import { getBillingConfig } from './platformBillingSettings.service.js';
import { getBillingProvider } from './billing/index.js';

/**
 * List available quota add-on packs.
 */
export function listQuotaAddonPacks() {
  return QUOTA_ADDON_PACKS;
}

/**
 * Credit quota and record payment idempotently (webhook, sync, or direct mode).
 * @param {string} tenantId
 * @param {string} packId
 * @param {{ provider: 'direct' | 'stripe' | 'razorpay'; externalId: string; amountMinor: number; currency: string; source?: string }} payment
 */
export async function fulfillQuotaAddonPurchase(tenantId, packId, payment) {
  const pack = getQuotaAddonPack(packId);
  if (!pack) {
    const err = new Error('Invalid quota pack');
    err.status = 400;
    throw err;
  }

  if (payment.externalId) {
    const existing = await Transaction.findOne({
      provider: payment.provider,
      externalId: payment.externalId,
    }).lean();
    if (existing) {
      return { alreadyApplied: true, pack, quotaBonusThisPeriod: null };
    }
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  tenant.subscription.quotaBonusThisPeriod =
    (tenant.subscription.quotaBonusThisPeriod ?? 0) + pack.emails;
  tenant.billing = tenant.billing || {};
  tenant.billing.pendingQuotaAddonPackId = '';
  tenant.billing.pendingQuotaPaymentLinkId = '';
  await tenant.save();

  await recordTransaction({
    tenantId,
    planId: tenant.subscription.planId || undefined,
    provider: payment.provider,
    externalId: payment.externalId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    status: 'paid',
    description: `Quota add-on — ${pack.label}`,
    metadata: { packId: pack.id, emails: pack.emails, source: payment.source || '' },
  });

  return {
    applied: true,
    pack,
    quotaBonusThisPeriod: tenant.subscription.quotaBonusThisPeriod,
  };
}

/**
 * Purchase a one-time quota add-on for the current billing period.
 * @param {string} tenantId
 * @param {string} packId
 */
export async function purchaseQuotaAddon(tenantId, packId) {
  const pack = getQuotaAddonPack(packId);
  if (!pack) {
    const err = new Error('Invalid quota pack');
    err.status = 400;
    throw err;
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const billingConfig = await getBillingConfig();

  if (billingConfig.mode === 'provider') {
    const billingProvider = await getBillingProvider();
    const session = await billingProvider.createQuotaAddonCheckout(tenantId, pack);

    tenant.billing = tenant.billing || {};
    tenant.billing.pendingQuotaAddonPackId = pack.id;
    tenant.billing.pendingQuotaPaymentLinkId = session.sessionId || '';
    await tenant.save();

    return {
      mode: 'redirect',
      checkoutUrl: session.checkoutUrl,
      pack,
      message: `Continue to ${billingConfig.provider === 'stripe' ? 'Stripe' : 'Razorpay'} to pay ${pack.label}.`,
    };
  }

  const result = await fulfillQuotaAddonPurchase(tenantId, packId, {
    provider: 'direct',
    externalId: `quota-addon-${tenantId}-${pack.id}-${Date.now()}`,
    amountMinor: pack.priceMinor,
    currency: pack.currency,
    source: 'direct',
  });

  return {
    mode: 'direct',
    message: `Added ${pack.emails.toLocaleString()} emails to your quota for this period.`,
    pack,
    quotaBonusThisPeriod: result.quotaBonusThisPeriod,
  };
}

/**
 * Reconcile a pending quota add-on after returning from payment (webhook may be delayed).
 * @param {string} tenantId
 */
export async function syncQuotaAddonPurchase(tenantId) {
  const billingConfig = await getBillingConfig();
  if (billingConfig.mode !== 'provider') {
    return { activated: false, status: 'direct' };
  }

  const billingProvider = await getBillingProvider();
  if (typeof billingProvider.syncQuotaAddonStatus !== 'function') {
    return { activated: false, status: 'unsupported' };
  }

  return billingProvider.syncQuotaAddonStatus(tenantId);
}

/**
 * Apply quota add-on after successful provider payment (webhook).
 * @param {string} tenantId
 * @param {string} packId
 */
export async function applyQuotaAddon(tenantId, packId) {
  const pack = getQuotaAddonPack(packId);
  if (!pack) return null;

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return null;

  tenant.subscription.quotaBonusThisPeriod =
    (tenant.subscription.quotaBonusThisPeriod ?? 0) + pack.emails;
  await tenant.save();
  return tenant;
}
