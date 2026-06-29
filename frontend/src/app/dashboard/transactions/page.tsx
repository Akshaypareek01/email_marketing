'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge, Card, CardBody, CardHeader, EmptyState, Skeleton, ButtonLink } from '@/components/ui';
import type { Tone } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate, formatPrice } from '@/lib/format';
import {
  showCancelAtPeriodEndNotice,
  subscriptionPeriodDate,
  subscriptionPeriodLabel,
} from '@/lib/subscription';
import type { AccountOverview, BillingTransaction, Plan } from '@/lib/types';

/** Map a transaction status to a Badge tone. */
function txTone(status: BillingTransaction['status']): Tone {
  if (status === 'paid') return 'success';
  if (status === 'pending') return 'info';
  if (status === 'refunded') return 'warning';
  return 'danger'; // failed
}

/** Map a subscription status to a Badge tone. */
function subTone(status: AccountOverview['subscription']['status']): Tone {
  if (status === 'active') return 'success';
  if (status === 'trialing') return 'info';
  if (status === 'past_due') return 'warning';
  return 'danger'; // canceled
}

export default function TransactionsPage() {
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    const [acct, planRes, txRes] = await Promise.all([
      token ? api.accountOverview(token).catch(() => null) : Promise.resolve(null),
      api.listPublicPlans().catch(() => ({ plans: [] })),
      token ? api.listBillingTransactions(token).catch(() => ({ transactions: [] })) : Promise.resolve({ transactions: [] }),
    ]);
    setAccount(acct);
    setPlans(planRes?.plans || []);
    setTransactions(txRes?.transactions || []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const sub = account?.subscription;
  const currentPlan = useMemo(
    () => plans.find((p) => p._id === sub?.planId),
    [plans, sub?.planId]
  );

  const renewsLabel = sub ? subscriptionPeriodLabel(sub) : '';

  return (
    <DashboardShell
      title="Transactions"
      subtitle="Your plan, subscription, and payment history"
      action={
        <ButtonLink href="/dashboard/billing" variant="outline" size="sm">
          Manage plan
        </ButtonLink>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Current subscription */}
          {sub && (
            <Card className="mb-8">
              <CardHeader
                title="Current subscription"
                action={<Badge tone={subTone(sub.status)}>{sub.status}</Badge>}
              />
              <CardBody>
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="mt-0.5 font-medium">{sub.planName || (sub.status === 'trialing' ? 'Free trial' : 'No plan')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Price</dt>
                    <dd className="mt-0.5 font-medium">
                      {currentPlan ? `${formatPrice(currentPlan.priceMinor, currentPlan.currency)} / ${currentPlan.interval}` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Monthly quota</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{sub.monthlyEmailQuota.toLocaleString()} emails</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{renewsLabel}</dt>
                    <dd className="mt-0.5 font-medium">{formatDate(subscriptionPeriodDate(sub))}</dd>
                  </div>
                </dl>

                {showCancelAtPeriodEndNotice(sub) && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Your plan is set to cancel and <strong>will not renew</strong> — you keep access until{' '}
                    {formatDate(sub.periodResetAt)}.
                  </div>
                )}
                {sub.status === 'trialing' && sub.trialExpired && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    Your free trial has ended.{' '}
                    <a href="/dashboard/billing" className="font-semibold underline underline-offset-2">
                      Choose a plan
                    </a>{' '}
                    to keep sending.
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Billing history */}
          <h2 className="mb-3 text-lg font-semibold">Billing history</h2>
          {transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              message="Payments and subscription charges will appear here once you subscribe to a plan."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => (
                    <tr key={tx._id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">{formatDate(tx.createdAt)}</td>
                      <td className="px-4 py-2.5">{tx.description || `${tx.provider} payment`}</td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">{tx.provider}</td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{formatPrice(tx.amountMinor, tx.currency)}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={txTone(tx.status)}>{tx.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
