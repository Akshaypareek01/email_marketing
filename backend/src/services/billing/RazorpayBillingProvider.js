import crypto from 'crypto';
import Razorpay from 'razorpay';
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
 * Razorpay subscription billing provider (INR-first).
 */
export class RazorpayBillingProvider extends BillingProvider {
  /** @type {Razorpay | null} */
  #client = null;

  /**
   * @returns {Razorpay}
   */
  #rz() {
    if (!env.billing.razorpay.keyId || !env.billing.razorpay.keySecret) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
    }
    if (!this.#client) {
      this.#client = new Razorpay({
        key_id: env.billing.razorpay.keyId,
        key_secret: env.billing.razorpay.keySecret,
      });
    }
    return this.#client;
  }

  /**
   * Resolve or create a Razorpay plan id for a Mail Box plan.
   * @param {import('../../models/Plan.js').Plan} plan
   */
  async #resolveRazorpayPlanId(plan) {
    if (plan.razorpayPlanId) return plan.razorpayPlanId;

    const rp = await this.#rz().plans.create({
      period: plan.interval === 'year' ? 'yearly' : 'monthly',
      interval: 1,
      item: {
        name: plan.name,
        amount: plan.priceMinor,
        currency: plan.currency,
        description: plan.description || undefined,
      },
    });

    plan.razorpayPlanId = rp.id;
    await plan.save();
    return rp.id;
  }

  /**
   * @param {string} tenantId
   * @param {string} planId
   */
  async createCheckoutSession(tenantId, planId) {
    const [tenant, plan, adminUser] = await Promise.all([
      Tenant.findById(tenantId),
      Plan.findById(planId),
      User.findOne({ tenantId, role: 'admin' }).sort({ createdAt: 1 }),
    ]);

    if (!tenant) throw new Error('Tenant not found');
    if (!plan || !plan.isActive) throw new Error('Plan not found or inactive');

    const razorpayPlanId = await this.#resolveRazorpayPlanId(plan);

    const subscription = await this.#rz().subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: plan.interval === 'year' ? 5 : 60,
      customer_notify: 1,
      notes: {
        tenantId: String(tenantId),
        planId: String(planId),
        tenantName: tenant.name,
        adminEmail: adminUser?.email || '',
      },
    });

    tenant.billing = tenant.billing || {};
    tenant.billing.razorpaySubscriptionId = subscription.id;
    await tenant.save();

    const checkoutUrl =
      subscription.short_url ||
      `${env.appUrl}/dashboard/billing?razorpay_subscription=${subscription.id}`;

    return { checkoutUrl, sessionId: subscription.id };
  }

  /**
   * Verify Razorpay webhook HMAC signature.
   * @param {Buffer | string} rawBody
   * @param {string} signature
   */
  #verifyWebhook(rawBody, signature) {
    const secret = env.billing.razorpay.webhookSecret;
    if (!secret) throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(String(signature || ''));
    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new Error('Invalid Razorpay webhook signature');
    }
  }

  /**
   * Activate a tenant's plan from a confirmed Razorpay subscription and record the payment.
   * Shared by the webhook and the on-return sync path so both behave identically and
   * idempotently (transaction is deduped by subscription id).
   * @param {string} tenantId
   * @param {string} planId
   * @param {string} subId Razorpay subscription id
   * @param {string} source label for the recorded transaction / logs
   */
  async #activateSubscription(tenantId, planId, subId, source) {
    await applyPlanToTenant(tenantId, planId, { status: 'active' });
    await resetQuotaOnRenewal(tenantId);
    await deactivateSystemNotice(tenantId, 'billing_past_due');
    await deactivateSystemNotice(tenantId, 'billing_canceled');

    const tenant = await Tenant.findById(tenantId);
    if (tenant && subId) {
      tenant.billing = tenant.billing || {};
      tenant.billing.razorpaySubscriptionId = subId;
      await tenant.save();
    }

    const plan = await Plan.findById(planId);
    await recordTransaction({
      tenantId,
      planId,
      provider: 'razorpay',
      externalId: subId || `razorpay-${tenantId}-${planId}`,
      amountMinor: plan?.priceMinor ?? 0,
      currency: plan?.currency ?? 'INR',
      status: 'paid',
      description: `Razorpay ${source} — ${plan?.name || 'subscription'}`,
      metadata: { subscriptionId: subId, source },
    });
  }

  /**
   * Reconcile a tenant's subscription by fetching its live status from Razorpay.
   * Used when the user returns from checkout (webhooks may be delayed or unreachable,
   * e.g. localhost). Activates the plan when Razorpay reports the subscription as paid.
   * @param {string} tenantId
   * @returns {Promise<{ activated: boolean, status: string, planId?: string }>}
   */
  async syncSubscriptionStatus(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const subId = tenant.billing?.razorpaySubscriptionId;
    if (!subId) return { activated: false, status: 'none' };

    const sub = await this.#rz().subscriptions.fetch(subId);
    const status = sub?.status || 'unknown';
    const planId = sub?.notes?.planId || (tenant.subscription?.planId ? String(tenant.subscription.planId) : null);

    // Razorpay marks a subscription 'active' once its first invoice is paid; 'charged'
    // covers renewals. (A subscription scheduled to cancel at cycle end stays 'active'
    // until the cycle actually ends, then moves to 'cancelled'.)
    const paidStatuses = ['active', 'charged'];
    if (planId && paidStatuses.includes(status)) {
      const alreadyActive =
        tenant.subscription?.status === 'active' &&
        String(tenant.subscription?.planId) === String(planId);
      if (!alreadyActive) {
        await this.#activateSubscription(tenantId, planId, subId, `subscription ${status}`);
      }
      return { activated: true, status, planId: String(planId) };
    }

    // Terminal states — reconcile a locally-active subscription to canceled (covers the
    // case where the cancellation webhook never reached us, e.g. localhost).
    const endedStatuses = ['cancelled', 'completed', 'expired', 'halted'];
    if (endedStatuses.includes(status) && tenant.subscription?.status === 'active') {
      tenant.subscription.status = 'canceled';
      tenant.subscription.cancelAtPeriodEnd = false;
      tenant.subscription.canceledAt = new Date();
      tenant.billing = tenant.billing || {};
      tenant.billing.razorpaySubscriptionId = '';
      await tenant.save();
    }

    return { activated: false, status };
  }

  /**
   * @param {Buffer | string} rawBody
   * @param {string} signature
   */
  async handleWebhook(rawBody, signature) {
    this.#verifyWebhook(rawBody, signature);

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const event = JSON.parse(body);
    const entity = event.payload?.subscription?.entity || event.payload?.payment?.entity;
    const notes = entity?.notes || {};
    const tenantId = notes.tenantId;
    const planId = notes.planId;

    switch (event.event) {
      case 'payment.captured':
        if (notes.type === 'quota_addon' && tenantId && notes.packId) {
          const { fulfillQuotaAddonPurchase } = await import('../quotaAddon.service.js');
          await fulfillQuotaAddonPurchase(tenantId, notes.packId, {
            provider: 'razorpay',
            externalId: entity?.id || `rz-pay-${Date.now()}`,
            amountMinor: entity?.amount ?? 0,
            currency: (entity?.currency || 'INR').toUpperCase(),
            source: 'payment.captured',
          });
        }
        break;
      case 'payment_link.paid': {
        const linkEntity = event.payload?.payment_link?.entity;
        const linkNotes = linkEntity?.notes || {};
        if (linkNotes.type === 'quota_addon' && linkNotes.tenantId && linkNotes.packId) {
          const { fulfillQuotaAddonPurchase } = await import('../quotaAddon.service.js');
          await fulfillQuotaAddonPurchase(linkNotes.tenantId, linkNotes.packId, {
            provider: 'razorpay',
            externalId: linkEntity?.id || entity?.id || `rz-link-${Date.now()}`,
            amountMinor: linkEntity?.amount ?? entity?.amount ?? 0,
            currency: (linkEntity?.currency || entity?.currency || 'INR').toUpperCase(),
            source: 'payment_link.paid',
          });
        }
        break;
      }
      case 'subscription.activated':
      case 'subscription.charged':
        if (tenantId && planId) {
          await this.#activateSubscription(tenantId, planId, entity?.id, event.event);
        }
        break;
      case 'subscription.cancelled':
      case 'subscription.halted':
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId);
          if (tenant) {
            tenant.subscription.status = 'canceled';
            tenant.subscription.cancelAtPeriodEnd = false;
            tenant.subscription.canceledAt = new Date();
            tenant.billing = tenant.billing || {};
            tenant.billing.razorpaySubscriptionId = '';
            await tenant.save();
          }
        }
        break;
      case 'payment.failed':
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId);
          if (tenant) {
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
          }
        }
        break;
      default:
        logger.debug({ tag: 'razorpay-webhook', event: event.event });
    }

    return { received: true, event: event.event };
  }

  /**
   * @param {string} tenantId
   * @param {string} planId
   * @param {{ direction?: string }} ctx
   */
  async changeSubscriptionPlan(tenantId, planId, ctx = {}) {
    const [tenant, plan] = await Promise.all([
      Tenant.findById(tenantId),
      Plan.findById(planId),
    ]);
    if (!tenant || !plan) throw new Error('Tenant or plan not found');

    const subId = tenant.billing?.razorpaySubscriptionId;
    if (!subId) return this.createCheckoutSession(tenantId, planId);

    const razorpayPlanId = await this.#resolveRazorpayPlanId(plan);
    await this.#rz().subscriptions.update(subId, {
      plan_id: razorpayPlanId,
      schedule_change_at: ctx.direction === 'downgrade' ? 'cycle_end' : 'now',
    });

    await applyPlanToTenant(tenantId, planId, {
      status: 'active',
      preserveUsage: ctx.direction === 'downgrade',
    });

    return {
      message: `Razorpay subscription updated (${ctx.direction || 'change'}).`,
      subscription: { planId: plan._id, planName: plan.name },
    };
  }

  /**
   * One-time quota add-on via Razorpay Payment Link (redirect to pay).
   * @param {string} tenantId
   * @param {{ id: string, label: string, emails: number, priceMinor: number, currency: string }} pack
   */
  async createQuotaAddonCheckout(tenantId, pack) {
    const [tenant, adminUser] = await Promise.all([
      Tenant.findById(tenantId),
      User.findOne({ tenantId, role: 'admin' }).sort({ createdAt: 1 }),
    ]);
    if (!tenant) throw new Error('Tenant not found');

    const paymentLink = await this.#rz().paymentLink.create({
      amount: pack.priceMinor,
      currency: pack.currency,
      description: `Mail Box — ${pack.label}`,
      customer: {
        name: tenant.name,
        email: adminUser?.email || undefined,
      },
      notify: { sms: false, email: Boolean(adminUser?.email) },
      reminder_enable: true,
      notes: {
        tenantId: String(tenantId),
        packId: pack.id,
        type: 'quota_addon',
      },
      callback_url: `${env.appUrl}/dashboard/billing?addon=success`,
      callback_method: 'get',
    });

    if (!paymentLink.short_url) {
      throw new Error('Razorpay did not return a payment link');
    }

    return { checkoutUrl: paymentLink.short_url, sessionId: paymentLink.id };
  }

  /**
   * Confirm a pending quota add-on payment link after the user returns from Razorpay.
   * @param {string} tenantId
   */
  async syncQuotaAddonStatus(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const linkId = tenant.billing?.pendingQuotaPaymentLinkId;
    const packId = tenant.billing?.pendingQuotaAddonPackId;
    if (!linkId || !packId) return { activated: false, status: 'none' };

    const link = await this.#rz().paymentLink.fetch(linkId);
    const status = link?.status || 'unknown';

    if (status === 'paid') {
      const { fulfillQuotaAddonPurchase } = await import('../quotaAddon.service.js');
      await fulfillQuotaAddonPurchase(tenantId, packId, {
        provider: 'razorpay',
        externalId: linkId,
        amountMinor: link.amount ?? 0,
        currency: (link.currency || 'INR').toUpperCase(),
        source: 'payment_link',
      });
      return { activated: true, status, packId };
    }

    return { activated: false, status, packId };
  }

  /**
   * @param {string} tenantId
   */
  async cancelSubscription(tenantId) {
    const tenant = await Tenant.findById(tenantId);
    const subId = tenant?.billing?.razorpaySubscriptionId;
    if (!subId) throw new Error('No active Razorpay subscription');

    // cancel_at_cycle_end: 1 keeps the subscription live until the paid period ends.
    // Note: Razorpay cancellation is terminal — it cannot be resumed once scheduled.
    await this.#rz().subscriptions.cancel(subId, { cancel_at_cycle_end: 1 });
    tenant.subscription.cancelAtPeriodEnd = true;
    await tenant.save();
    return { canceled: true };
  }
}
