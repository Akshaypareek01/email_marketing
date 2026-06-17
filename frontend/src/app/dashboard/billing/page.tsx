'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { QuotaBar } from '@/components/dashboard/QuotaBar';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { AccountOverview, BillingTransaction, Plan, QuotaAddonPack } from '@/lib/types';

/**
 * Resolve plan change button label from price comparison.
 */
function planActionLabel(current: Plan | undefined, next: Plan): string {
  if (!current) return 'Subscribe';
  if (next.priceMinor > current.priceMinor) return 'Upgrade';
  if (next.priceMinor < current.priceMinor) return 'Downgrade';
  return 'Switch plan';
}

export default function BillingPage() {
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quotaPacks, setQuotaPacks] = useState<QuotaAddonPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPlanId, setActionPlanId] = useState<string | null>(null);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    const [acct, planRes, txRes, packRes] = await Promise.all([
      token ? api.accountOverview(token).catch(() => null) : Promise.resolve(null),
      api.listPublicPlans().catch(() => ({ plans: [] })),
      token ? api.listBillingTransactions(token).catch(() => ({ transactions: [] })) : Promise.resolve({ transactions: [] }),
      token ? api.listQuotaPacks(token).catch(() => ({ packs: [] })) : Promise.resolve({ packs: [] }),
    ]);
    setAccount(acct);
    setPlans((planRes?.plans || []).filter((p) => p.isActive && p.isPublic));
    setTransactions(txRes?.transactions || []);
    setQuotaPacks(packRes?.packs || []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const currentPlan = useMemo(
    () => plans.find((p) => p._id === account?.subscription.planId),
    [plans, account?.subscription.planId]
  );

  const hasActiveSubscription = Boolean(
    account?.subscription.planId &&
      (account.subscription.status === 'active' || account.subscription.status === 'past_due')
  );

  async function onSelectPlan(planId: string) {
    const token = getToken();
    if (!token) return;
    setActionPlanId(planId);
    setError('');
    setNotice('');
    try {
      const fn = hasActiveSubscription ? api.billingChangePlan : api.billingCheckout;
      const res = await fn(token, planId);
      if (res.mode === 'redirect' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setNotice(res.message || 'Plan updated.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Plan change failed');
    } finally {
      setActionPlanId(null);
    }
  }

  async function onBuyQuotaPack(packId: string) {
    const token = getToken();
    if (!token) return;
    setBuyingPackId(packId);
    setError('');
    setNotice('');
    try {
      const res = await api.buyQuotaAddon(token, packId);
      if (res.mode === 'redirect' && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      setNotice(res.message || 'Quota add-on applied.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Purchase failed');
    } finally {
      setBuyingPackId(null);
    }
  }

  async function onCancel() {
    const token = getToken();
    if (!token || !confirm('Cancel your subscription? Sending will stop at period end.')) return;
    setError('');
    try {
      await api.billingCancel(token);
      setNotice('Subscription canceled.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cancel failed');
    }
  }

  const currentPlanId = account?.subscription.planId;
  const quotaBonus = account?.subscription.quotaBonusThisPeriod ?? 0;

  return (
    <DashboardShell title="Billing & plans" subtitle="Manage your subscription and email quota">
      {notice && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {account && (
            <div className="mb-8">
              <QuotaBar
                used={account.subscription.emailsSentThisPeriod}
                total={account.subscription.monthlyEmailQuota}
                remaining={account.subscription.remaining}
                usedPct={account.subscription.usedPct}
                planName={account.subscription.planName}
              />
              {quotaBonus > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Includes{' '}
                  <span className="font-medium text-foreground">
                    +{quotaBonus.toLocaleString()}
                  </span>{' '}
                  bonus emails from add-ons this period
                  {account.subscription.baseMonthlyQuota != null && (
                    <>
                      {' '}
                      (base plan: {account.subscription.baseMonthlyQuota.toLocaleString()})
                    </>
                  )}
                </p>
              )}
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-0.5 font-medium capitalize">{account.subscription.status}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Period started</dt>
                  <dd className="mt-0.5 font-medium">{formatDate(account.subscription.periodStart)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Resets on</dt>
                  <dd className="mt-0.5 font-medium">
                    {account.subscription.periodResetAt
                      ? formatDate(account.subscription.periodResetAt)
                      : '—'}
                  </dd>
                </div>
              </dl>
              {account.subscription.status === 'active' && account.subscription.planId && (
                <div className="mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                    Cancel subscription
                  </Button>
                </div>
              )}
            </div>
          )}

          {hasActiveSubscription && quotaPacks.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-1 text-lg font-semibold">Need more emails this month?</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                One-time add-ons apply to your current billing period and reset on renewal.
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                {quotaPacks.map((pack) => (
                  <Card key={pack.id}>
                    <CardBody>
                      <p className="font-semibold">{pack.label}</p>
                      <p className="mt-1 text-2xl font-bold">
                        {formatPrice(pack.priceMinor, pack.currency)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        +{pack.emails.toLocaleString()} emails
                      </p>
                      <Button
                        className="mt-4 w-full"
                        size="sm"
                        loading={buyingPackId === pack.id}
                        onClick={() => onBuyQuotaPack(pack.id)}
                      >
                        Buy add-on
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {transactions.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-semibold">Billing history</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Description</th>
                      <th className="px-4 py-2 font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx._id} className="border-t border-border">
                        <td className="px-4 py-2">{formatDate(tx.createdAt)}</td>
                        <td className="px-4 py-2">{tx.description || tx.provider}</td>
                        <td className="px-4 py-2">{formatPrice(tx.amountMinor, tx.currency)}</td>
                        <td className="px-4 py-2 capitalize">{tx.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h2 className="mb-4 text-lg font-semibold">Available plans</h2>
          {plans.length === 0 ? (
            <EmptyState title="No public plans yet" message="Plans will appear here once configured by the platform admin." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = currentPlanId === plan._id;
                const actionLabel = isCurrent ? 'Current plan' : planActionLabel(currentPlan, plan);
                return (
                  <Card key={plan._id} className={isCurrent ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/20' : ''}>
                    <CardHeader title={plan.name} subtitle={plan.description} action={isCurrent ? <Badge tone="primary">Current</Badge> : undefined} />
                    <CardBody>
                      <p className="text-3xl font-bold">
                        {formatPrice(plan.priceMinor, plan.currency)}
                        <span className="text-sm font-normal text-muted-foreground">/{plan.interval}</span>
                      </p>
                      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <li>{plan.monthlyEmailQuota.toLocaleString()} emails / month</li>
                        <li>{plan.maxContacts.toLocaleString()} contacts</li>
                        <li>{plan.maxDomains} domains · {plan.maxTeamUsers} team users</li>
                      </ul>
                      <Button
                        className="mt-5 w-full"
                        variant={isCurrent ? 'secondary' : 'primary'}
                        disabled={isCurrent}
                        loading={actionPlanId === plan._id}
                        onClick={() => onSelectPlan(plan._id)}
                      >
                        {actionLabel}
                      </Button>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
