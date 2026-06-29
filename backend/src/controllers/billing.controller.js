import { getBillingConfig, getPublicBillingConfig } from '../services/platformBillingSettings.service.js';
import { getBillingProvider, getBillingProviderForWebhook } from '../services/billing/index.js';
import { changeTenantPlan } from '../services/changePlan.service.js';
import {
  listQuotaAddonPacks,
  purchaseQuotaAddon,
} from '../services/quotaAddon.service.js';
import { applyPlanToTenant } from '../services/subscription.service.js';
import {
  listTenantTransactions,
  recordTransaction,
} from '../services/billing/transaction.service.js';

/**
 * Public billing flags for tenant checkout UI.
 */
export async function getBillingConfigPublic(req, res, next) {
  try {
    const config = await getPublicBillingConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
}

/**
 * Start checkout for a plan. Uses payment provider when configured; otherwise direct assign (dev/MVP).
 */
export async function createCheckout(req, res, next) {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ message: 'planId is required' });

    const tenantId = req.user.tenantId;
    const billingConfig = await getBillingConfig();

    if (billingConfig.mode === 'provider') {
      try {
        const provider = await getBillingProvider();
        const session = await provider.createCheckoutSession(tenantId, planId);
        return res.json({ mode: 'redirect', provider: billingConfig.provider, ...session });
      } catch (err) {
        return res.status(503).json({
          message: err.message || 'Payment provider is not configured yet.',
          code: 'billing_not_configured',
        });
      }
    }

    const { tenant, plan } = await applyPlanToTenant(tenantId, planId, { status: 'active' });

    await recordTransaction({
      tenantId,
      planId: plan._id,
      provider: 'direct',
      externalId: `direct-${tenantId}-${plan._id}-${Date.now()}`,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      status: 'paid',
      description: `Direct subscribe — ${plan.name}`,
    });

    res.json({
      mode: 'direct',
      message: `Subscribed to ${plan.name}. Payment collection will be enabled when billing provider is connected.`,
      subscription: {
        planId: plan._id,
        planName: plan.name,
        status: tenant.subscription.status,
        monthlyEmailQuota: tenant.subscription.monthlyEmailQuota,
      },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Stripe/Razorpay webhook entry (requires raw body — registered in app.js).
 */
export async function billingWebhook(req, res) {
  try {
    const signature = req.headers['stripe-signature'] || req.headers['x-razorpay-signature'] || '';
    const rawBody = req.body;
    const provider = await getBillingProviderForWebhook(req.headers, String(signature));
    await provider.handleWebhook(rawBody, String(signature));
    res.json({ received: true });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Webhook failed' });
  }
}

/**
 * Reconcile the tenant's subscription with the billing provider after checkout.
 * Razorpay activates plans via webhook, which can be delayed or unreachable (e.g.
 * localhost dev). This pulls live status from the provider and activates immediately.
 */
export async function syncCheckoutStatus(req, res, next) {
  try {
    const billingConfig = await getBillingConfig();
    if (billingConfig.mode !== 'provider') {
      return res.json({ activated: false, status: 'direct' });
    }
    const provider = await getBillingProvider();
    const result = await provider.syncSubscriptionStatus(req.user.tenantId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Tenant billing history.
 */
export async function listMyTransactions(req, res, next) {
  try {
    const transactions = await listTenantTransactions(req.user.tenantId);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel active subscription via billing provider or direct mode.
 */
export async function cancelSubscription(req, res, next) {
  try {
    const tenantId = req.user.tenantId;
    const billingConfig = await getBillingConfig();

    if (billingConfig.mode === 'provider') {
      const provider = await getBillingProvider();
      await provider.cancelSubscription(tenantId);
    } else {
      // Direct mode: schedule cancellation for period end — keep access until then.
      const { Tenant } = await import('../models/Tenant.js');
      const tenant = await Tenant.findById(tenantId);
      if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
      tenant.subscription.cancelAtPeriodEnd = true;
      await tenant.save();
    }

    res.json({
      message: 'Subscription canceled — your plan stays active until the end of the current billing period.',
      canceled: true,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * Upgrade or downgrade plan with proration when provider supports it.
 */
export async function changePlan(req, res, next) {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ message: 'planId is required' });
    const result = await changeTenantPlan(req.user.tenantId, planId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/**
 * List one-time quota add-on packs.
 */
export async function getQuotaPacks(req, res) {
  res.json({ packs: listQuotaAddonPacks() });
}

/**
 * Purchase a quota add-on for the current billing period.
 */
export async function buyQuotaAddon(req, res, next) {
  try {
    const { packId } = req.body;
    if (!packId) return res.status(400).json({ message: 'packId is required' });
    const result = await purchaseQuotaAddon(req.user.tenantId, packId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
