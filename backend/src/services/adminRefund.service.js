import Stripe from 'stripe';
import Razorpay from 'razorpay';
import { Transaction } from '../models/Transaction.js';
import { env } from '../config/env.js';
import { writeAuditLog, auditContext } from './audit.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Attempt a Stripe refund for a recorded transaction.
 * @param {import('../models/Transaction.js').Transaction} tx
 */
async function refundViaStripe(tx) {
  if (!env.billing.stripe.secretKey) {
    throw new Error('Stripe is not configured');
  }

  const stripe = new Stripe(env.billing.stripe.secretKey);
  const meta = tx.metadata || {};

  if (meta.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(String(meta.sessionId));
    const paymentIntent = session.payment_intent;
    if (typeof paymentIntent === 'string') {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        amount: tx.amountMinor,
      });
      return refund.id;
    }
  }

  if (tx.externalId?.startsWith('in_')) {
    const invoice = await stripe.invoices.retrieve(tx.externalId);
    const paymentIntent = invoice.payment_intent;
    if (typeof paymentIntent === 'string') {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        amount: tx.amountMinor,
      });
      return refund.id;
    }
  }

  throw new Error('No Stripe payment reference found on this transaction');
}

/**
 * Attempt a Razorpay refund using stored payment id metadata.
 * @param {import('../models/Transaction.js').Transaction} tx
 */
async function refundViaRazorpay(tx) {
  if (!env.billing.razorpay.keyId || !env.billing.razorpay.keySecret) {
    throw new Error('Razorpay is not configured');
  }

  const meta = tx.metadata || {};
  let paymentId = meta.paymentId;

  const rz = new Razorpay({
    key_id: env.billing.razorpay.keyId,
    key_secret: env.billing.razorpay.keySecret,
  });

  if (!paymentId && meta.subscriptionId) {
    const payments = await rz.payments.all({ subscription_id: meta.subscriptionId, count: 1 });
    paymentId = payments.items?.[0]?.id;
  }

  if (!paymentId && tx.externalId?.startsWith('pay_')) {
    paymentId = tx.externalId;
  }

  if (!paymentId) {
    throw new Error('No Razorpay payment id found on this transaction');
  }

  const refund = await rz.payments.refund(paymentId, { amount: tx.amountMinor });
  return refund.id;
}

/**
 * Mark a paid transaction as refunded (provider refund when possible).
 * @param {import('express').Request} req
 * @param {string} transactionId
 * @param {{ skipProvider?: boolean, reason?: string }} [options]
 */
export async function adminRefundTransaction(req, transactionId, options = {}) {
  const tx = await Transaction.findById(transactionId);
  if (!tx) {
    const err = new Error('Transaction not found');
    err.status = 404;
    throw err;
  }
  if (tx.status !== 'paid') {
    const err = new Error('Only paid transactions can be refunded');
    err.status = 400;
    throw err;
  }

  let providerRefundId = null;
  if (!options.skipProvider) {
    try {
      if (tx.provider === 'stripe') {
        providerRefundId = await refundViaStripe(tx);
      } else if (tx.provider === 'razorpay') {
        providerRefundId = await refundViaRazorpay(tx);
      }
    } catch (err) {
      logger.warn({ tag: 'admin-refund', transactionId, provider: tx.provider, error: err.message });
      const e = new Error(
        `${tx.provider} refund failed: ${err.message}. Use skipProvider to mark refunded locally.`
      );
      e.status = 502;
      throw e;
    }
  }

  tx.status = 'refunded';
  tx.metadata = {
    ...(tx.metadata || {}),
    refundedAt: new Date().toISOString(),
    refundReason: options.reason || '',
    providerRefundId,
    refundedBy: String(req.user._id),
  };
  await tx.save();

  await writeAuditLog({
    ...auditContext(req),
    tenantId: tx.tenantId,
    action: 'admin.transaction.refund',
    targetType: 'transaction',
    targetId: String(tx._id),
    metadata: { provider: tx.provider, providerRefundId, amountMinor: tx.amountMinor },
  });

  return tx;
}
