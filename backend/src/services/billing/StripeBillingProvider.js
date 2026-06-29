import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { Tenant } from '../../models/Tenant.js';
import { Plan } from '../../models/Plan.js';
import { User } from '../../models/User.js';
import { applyPlanToTenant, resetQuotaOnRenewal } from '../subscription.service.js';
import { recordTransaction } from './transaction.service.js';
import { upsertSystemNotice, deactivateSystemNotice } from '../systemNotice.service.js';
import { BillingProvider } from './BillingProvider.js';
import logger from '../../middleware/logsCreate.js';

/**
 * Stripe implementation of the billing provider interface.
 */
export class StripeBillingProvider extends BillingProvider {
  /** @type {Stripe | null} */
  #stripe = null;

  /**
   * Lazy Stripe client — only initialized when secret key is present.
   * @returns {Stripe}
   */
  #client() {
    if (!env.billing.stripe.secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    if (!this.#stripe) {
      this.#stripe = new Stripe(env.billing.stripe.secretKey);
    }
    return this.#stripe;
  }

  /**
   * @param {string} tenantId
   * @param {string} planId
   * @returns {Promise<{ checkoutUrl: string, sessionId: string }>}
   */
  async createCheckoutSession(tenantId, planId) {
    const stripe = this.#client();
    const [tenant, plan, adminUser] = await Promise.all([
      Tenant.findById(tenantId),
      Plan.findById(planId),
      User.findOne({ tenantId, role: 'admin' }).sort({ createdAt: 1 }),
    ]);

    if (!tenant) throw new Error('Tenant not found');
    if (!plan || !plan.isActive) throw new Error('Plan not found or inactive');

    let customerId = tenant.billing?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: adminUser?.email,
        name: tenant.name,
        metadata: { tenantId: String(tenantId) },
      });
      customerId = customer.id;
      tenant.billing = tenant.billing || {};
      tenant.billing.stripeCustomerId = customerId;
      await tenant.save();
    }

    const lineItem = plan.stripePriceId
      ? { price: plan.stripePriceId, quantity: 1 }
      : {
          price_data: {
            currency: plan.currency.toLowerCase(),
            unit_amount: plan.priceMinor,
            recurring: { interval: plan.interval === 'year' ? 'year' : 'month' },
            product_data: {
              name: plan.name,
              description: plan.description || undefined,
            },
          },
          quantity: 1,
        };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [lineItem],
      success_url: `${env.appUrl}/dashboard/billing?checkout=success`,
      cancel_url: `${env.appUrl}/dashboard/billing?checkout=canceled`,
      metadata: {
        tenantId: String(tenantId),
        planId: String(planId),
      },
      subscription_data: {
        metadata: {
          tenantId: String(tenantId),
          planId: String(planId),
        },
      },
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL');

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  /**
   * Verify and process Stripe webhook events.
   * @param {Buffer | string} rawBody
   * @param {string} signature
   */
  async handleWebhook(rawBody, signature) {
    const stripe = this.#client();
    const secret = env.billing.stripe.webhookSecret;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');

    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.#onCheckoutCompleted(event.data.object);
        break;
      case 'invoice.paid':
        await this.#onInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.#onPaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.#onSubscriptionDeleted(event.data.object);
        break;
      default:
        logger.debug({ tag: 'stripe-webhook', type: event.type });
    }

    return { received: true, type: event.type };
  }

  /**
   * @param {string} tenantId
   */
  async cancelSubscription(tenantId) {
    const stripe = this.#client();
    const tenant = await Tenant.findById(tenantId);
    if (!tenant?.billing?.stripeSubscriptionId) {
      throw new Error('No active Stripe subscription');
    }

    // Schedule cancellation at period end so the tenant keeps access they paid for.
    // Stripe fires customer.subscription.deleted when the period actually ends.
    await stripe.subscriptions.update(tenant.billing.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    tenant.subscription.cancelAtPeriodEnd = true;
    await tenant.save();
    return { canceled: true };
  }

  /**
   * @param {string} tenantId
   * @param {string} planId
   * @param {{ direction?: string }} ctx
   */
  async changeSubscriptionPlan(tenantId, planId, ctx = {}) {
    const stripe = this.#client();
    const [tenant, plan] = await Promise.all([
      Tenant.findById(tenantId),
      Plan.findById(planId),
    ]);
    if (!tenant || !plan) throw new Error('Tenant or plan not found');

    const subId = tenant.billing?.stripeSubscriptionId;
    if (!subId || !plan.stripePriceId) {
      return this.createCheckoutSession(tenantId, planId);
    }

    const subscription = await stripe.subscriptions.retrieve(subId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) throw new Error('Stripe subscription has no items');

    await stripe.subscriptions.update(subId, {
      items: [{ id: itemId, price: plan.stripePriceId }],
      proration_behavior: ctx.direction === 'upgrade' ? 'create_prorations' : 'none',
      metadata: { tenantId: String(tenantId), planId: String(planId) },
    });

    await applyPlanToTenant(tenantId, planId, {
      status: 'active',
      preserveUsage: ctx.direction === 'downgrade',
    });

    return {
      message: `Stripe subscription updated (${ctx.direction || 'change'}).`,
      subscription: { planId: plan._id, planName: plan.name },
    };
  }

  /**
   * One-time quota add-on via Stripe Checkout (payment mode).
   * @param {string} tenantId
   * @param {{ id: string, label: string, emails: number, priceMinor: number, currency: string }} pack
   */
  async createQuotaAddonCheckout(tenantId, pack) {
    const stripe = this.#client();
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    let customerId = tenant.billing?.stripeCustomerId;
    if (!customerId) {
      const adminUser = await User.findOne({ tenantId, role: 'admin' }).sort({ createdAt: 1 });
      const customer = await stripe.customers.create({
        email: adminUser?.email,
        name: tenant.name,
        metadata: { tenantId: String(tenantId) },
      });
      customerId = customer.id;
      tenant.billing = tenant.billing || {};
      tenant.billing.stripeCustomerId = customerId;
      await tenant.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: pack.currency.toLowerCase(),
            unit_amount: pack.priceMinor,
            product_data: { name: pack.label },
          },
          quantity: 1,
        },
      ],
      success_url: `${env.appUrl}/dashboard/billing?addon=success`,
      cancel_url: `${env.appUrl}/dashboard/billing?addon=canceled`,
      metadata: {
        tenantId: String(tenantId),
        packId: pack.id,
        type: 'quota_addon',
      },
    });

    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return { checkoutUrl: session.url, sessionId: session.id };
  }

  /**
   * @param {Stripe.Checkout.Session} session
   */
  async #onCheckoutCompleted(session) {
    const tenantId = session.metadata?.tenantId;
    const planId = session.metadata?.planId;
    const packId = session.metadata?.packId;

    if (session.metadata?.type === 'quota_addon' && tenantId && packId) {
      const { fulfillQuotaAddonPurchase } = await import('../quotaAddon.service.js');
      await fulfillQuotaAddonPurchase(tenantId, packId, {
        provider: 'stripe',
        externalId: session.id,
        amountMinor: session.amount_total ?? 0,
        currency: (session.currency || 'inr').toUpperCase(),
        source: 'checkout.completed',
      });
      return;
    }

    if (!tenantId || !planId) return;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return;

    if (session.subscription && typeof session.subscription === 'string') {
      tenant.billing = tenant.billing || {};
      tenant.billing.stripeSubscriptionId = session.subscription;
    }

    await applyPlanToTenant(tenantId, planId, { status: 'active' });
    await tenant.save();

    const plan = await Plan.findById(planId);
    await recordTransaction({
      tenantId,
      planId,
      provider: 'stripe',
      externalId: session.id,
      amountMinor: plan?.priceMinor ?? 0,
      currency: plan?.currency ?? 'INR',
      status: 'paid',
      description: `Checkout completed — ${plan?.name || planId}`,
      metadata: { sessionId: session.id, subscriptionId: session.subscription },
    });
  }

  /**
   * @param {Stripe.Invoice} invoice
   */
  async #onInvoicePaid(invoice) {
    let tenantId = invoice.subscription_details?.metadata?.tenantId
      || invoice.metadata?.tenantId;

    if (!tenantId && invoice.customer) {
      const tenant = await Tenant.findOne({
        'billing.stripeCustomerId': String(invoice.customer),
      }).select('_id');
      tenantId = tenant?._id ? String(tenant._id) : undefined;
    }

    const planId = invoice.subscription_details?.metadata?.planId
      || invoice.metadata?.planId;

    if (!tenantId) return;

    await recordTransaction({
      tenantId,
      planId: planId || undefined,
      provider: 'stripe',
      externalId: invoice.id,
      amountMinor: invoice.amount_paid ?? 0,
      currency: (invoice.currency || 'inr').toUpperCase(),
      status: 'paid',
      description: invoice.description || 'Subscription invoice paid',
      metadata: { invoiceNumber: invoice.number },
    });

    await resetQuotaOnRenewal(tenantId);
    await deactivateSystemNotice(tenantId, 'billing_past_due');
    await deactivateSystemNotice(tenantId, 'billing_canceled');
  }

  /**
   * @param {Stripe.Invoice} invoice
   */
  async #onPaymentFailed(invoice) {
    let tenantId = invoice.subscription_details?.metadata?.tenantId
      || invoice.metadata?.tenantId;

    if (!tenantId && invoice.customer) {
      const tenant = await Tenant.findOne({
        'billing.stripeCustomerId': String(invoice.customer),
      }).select('_id');
      tenantId = tenant?._id ? String(tenant._id) : undefined;
    }

    if (!tenantId) return;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return;

    tenant.subscription.status = 'past_due';
    await tenant.save();

    await upsertSystemNotice({
      tenantId,
      dedupeKey: 'billing_past_due',
      title: 'Payment past due',
      message: 'Your subscription payment failed. Update billing to resume sending.',
      severity: 'warning',
      category: 'billing',
      actionHref: '/dashboard/billing',
      actionLabel: 'Update billing',
    });

    await recordTransaction({
      tenantId,
      provider: 'stripe',
      externalId: `${invoice.id}-failed`,
      amountMinor: invoice.amount_due ?? 0,
      currency: (invoice.currency || 'inr').toUpperCase(),
      status: 'failed',
      description: 'Invoice payment failed',
    });
  }

  /**
   * @param {Stripe.Subscription} subscription
   */
  async #onSubscriptionDeleted(subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return;

    tenant.subscription.status = 'canceled';
    tenant.billing = tenant.billing || {};
    tenant.billing.stripeSubscriptionId = '';
    await tenant.save();
  }

  /**
   * Confirm a pending Stripe Checkout session for a quota add-on.
   * @param {string} tenantId
   */
  async syncQuotaAddonStatus(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const sessionId = tenant.billing?.pendingQuotaPaymentLinkId;
    const packId = tenant.billing?.pendingQuotaAddonPackId;
    if (!sessionId || !packId) return { activated: false, status: 'none' };

    const session = await this.#client().checkout.sessions.retrieve(sessionId);
    const status = session.payment_status || 'unknown';

    if (status === 'paid') {
      const { fulfillQuotaAddonPurchase } = await import('../quotaAddon.service.js');
      await fulfillQuotaAddonPurchase(tenantId, packId, {
        provider: 'stripe',
        externalId: session.id,
        amountMinor: session.amount_total ?? 0,
        currency: (session.currency || 'inr').toUpperCase(),
        source: 'checkout.sync',
      });
      return { activated: true, status, packId };
    }

    return { activated: false, status, packId };
  }
}
