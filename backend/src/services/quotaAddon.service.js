import { getQuotaAddonPack, QUOTA_ADDON_PACKS } from '../constants/quotaAddonPacks.js';
import { Tenant } from '../models/Tenant.js';
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
    try {
      const billingProvider = await getBillingProvider();
      const session = await billingProvider.createQuotaAddonCheckout(tenantId, pack);
      return { mode: 'redirect', checkoutUrl: session.checkoutUrl, pack };
    } catch {
      // Fall through to direct credit when provider one-time checkout is unavailable.
    }
  }

  tenant.subscription.quotaBonusThisPeriod =
    (tenant.subscription.quotaBonusThisPeriod ?? 0) + pack.emails;
  await tenant.save();

  await recordTransaction({
    tenantId,
    planId: tenant.subscription.planId || undefined,
    provider: 'direct',
    externalId: `quota-addon-${tenantId}-${pack.id}-${Date.now()}`,
    amountMinor: pack.priceMinor,
    currency: pack.currency,
    status: 'paid',
    description: `Quota add-on — ${pack.label}`,
    metadata: { packId: pack.id, emails: pack.emails },
  });

  return {
    mode: 'direct',
    message: `Added ${pack.emails.toLocaleString()} emails to your quota for this period.`,
    pack,
    quotaBonusThisPeriod: tenant.subscription.quotaBonusThisPeriod,
  };
}

/**
 * Apply quota add-on after successful provider payment (webhook or direct).
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
