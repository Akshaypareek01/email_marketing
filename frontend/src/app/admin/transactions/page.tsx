'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Badge, Button, Card, CardBody, EmptyState, Skeleton, statusTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { BillingTransaction } from '@/lib/types';

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await api.adminListTransactions(token);
    setTransactions(res.transactions);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefund(tx: BillingTransaction) {
    const token = getToken();
    if (!token) return;
    const reason = prompt('Refund reason (optional):') || '';
    const hasRazorpayPayment =
      tx.provider === 'razorpay' &&
      Boolean(tx.metadata?.paymentId || tx.externalId?.startsWith('pay_'));
    const skipProvider = tx.provider === 'direct' || (tx.provider === 'razorpay' && !hasRazorpayPayment);
    const msg = skipProvider
      ? 'Mark this transaction as refunded locally? (No provider payment reference found.)'
      : tx.provider === 'razorpay'
        ? 'Issue refund via Razorpay and mark transaction refunded?'
        : 'Issue refund via Stripe and mark transaction refunded?';
    if (!confirm(msg)) return;

    setRefundingId(tx._id);
    setError('');
    try {
      await api.adminRefundTransaction(token, tx._id, { skipProvider, reason });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Refund failed');
    } finally {
      setRefundingId(null);
    }
  }

  return (
    <AdminShell title="Transactions">
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {loading ? (
        <Skeleton className="h-64" />
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions yet" message="Billing activity will appear here once tenants subscribe." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const tenant = tx.tenantId as unknown as { name?: string; slug?: string } | string;
                  const tenantLabel =
                    typeof tenant === 'object' && tenant?.name ? tenant.name : String(tenant).slice(-8);
                  return (
                    <tr key={tx._id} className="border-t border-border">
                      <td className="px-4 py-3">{formatDate(tx.createdAt)}</td>
                      <td className="px-4 py-3">{tenantLabel}</td>
                      <td className="px-4 py-3">{tx.description || '—'}</td>
                      <td className="px-4 py-3 capitalize">{tx.provider}</td>
                      <td className="px-4 py-3">{formatPrice(tx.amountMinor, tx.currency)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(tx.status)}>{tx.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tx.status === 'paid' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={refundingId === tx._id}
                            onClick={() => onRefund(tx)}
                          >
                            Refund
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </AdminShell>
  );
}
