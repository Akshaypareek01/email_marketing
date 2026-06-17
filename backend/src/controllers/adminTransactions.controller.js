import { listAllTransactions } from '../services/billing/transaction.service.js';
import { adminRefundTransaction } from '../services/adminRefund.service.js';

/**
 * Super admin: platform-wide billing transactions.
 */
export async function adminListTransactions(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const transactions = await listAllTransactions(limit);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
}

/**
 * Refund a paid transaction (Stripe when possible; direct always local).
 */
export async function adminRefundTransactionHandler(req, res, next) {
  try {
    const { skipProvider, reason } = req.body || {};
    const transaction = await adminRefundTransaction(req, req.params.id, {
      skipProvider: Boolean(skipProvider),
      reason: reason?.trim() || '',
    });
    res.json({ transaction });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
