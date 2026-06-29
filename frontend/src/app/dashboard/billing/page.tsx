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
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate, formatPrice } from '@/lib/format';
import {
  showCancelAtPeriodEndNotice,
  subscriptionPeriodDate,
} from '@/lib/subscription';
import type { AccountOverview, BillingTransaction, Plan } from '@/lib/types';

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
  // const [quotaPacks, setQuotaPacks] = useState<QuotaAddonPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPlanId, setActionPlanId] = useState<string | null>(null);
  // const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // const [addonConfirmPack, setAddonConfirmPack] = useState<QuotaAddonPack | null>(null);
  // const [billingConfig, setBillingConfig] = useState<PublicBillingConfig | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    const [acct, planRes, txRes] = await Promise.all([
      token ? api.accountOverview(token).catch(() => null) : Promise.resolve(null),
      api.listPublicPlans().catch(() => ({ plans: [] })),
      token ? api.listBillingTransactions(token).catch(() => ({ transactions: [] })) : Promise.resolve({ transactions: [] }),
      // token ? api.listQuotaPacks(token).catch(() => ({ packs: [] })) : Promise.resolve({ packs: [] }),
      // api.getBillingConfig().catch(() => null),
    ]);
    setAccount(acct);
    setPlans((planRes?.plans || []).filter((p) => p.isActive && p.isPublic));
    setTransactions(txRes?.transactions || []);
    // setQuotaPacks(packRes?.packs || []);
    // setBillingConfig(configRes);
    return acct;
  }, []);

  /*
  const runAddonSync = useCallback(
    async ({ manual }: { manual: boolean }) => {
      const token = getToken();
      if (!token) return;
      setSyncing(true);
      if (manual) {
        setError('');
        setNotice('');
      }
      try {
        const res = await api.syncQuotaAddon(token);
        if (res.activated) {
          setNotice('Payment confirmed — bonus emails added to your quota.');
          await load();
        } else if (manual) {
          setNotice(
            res.status === 'none'
              ? 'No pending add-on payment found.'
              : `Payment not confirmed yet (status: ${res.status}). If you just paid, wait a moment and try again.`
          );
        }
      } catch (err) {
        if (manual) setError(err instanceof ApiError ? err.message : 'Could not verify add-on payment');
      } finally {
        setSyncing(false);
      }
    },
    [load]
  );
  */

  /**
   * Reconcile with the payment provider after returning from checkout. Razorpay
   * activates via webhook (often delayed or unreachable on localhost), so we pull
   * live status and activate immediately. `manual` surfaces a result message.
   */
  const runSync = useCallback(
    async ({ manual }: { manual: boolean }) => {
      const token = getToken();
      if (!token) return;
      setSyncing(true);
      if (manual) {
        setError('');
        setNotice('');
      }
      try {
        const res = await api.billingSyncCheckout(token);
        if (res.activated) {
          setNotice('Payment confirmed — your plan is now active.');
          await load();
        } else if (manual) {
          setNotice(
            res.status === 'none'
              ? 'No pending payment found. Pick a plan to subscribe.'
              : `Payment not confirmed yet (status: ${res.status}). If you just paid, wait a moment and refresh again.`
          );
        }
      } catch (err) {
        if (manual) setError(err instanceof ApiError ? err.message : 'Could not verify payment');
      } finally {
        setSyncing(false);
      }
    },
    [load]
  );

  useEffect(() => {
    (async () => {
      const acct = await load();
      // Strip the post-checkout query param so a refresh doesn't re-trigger.
      const params = new URLSearchParams(window.location.search);
      // const addonStatus = params.get('addon');
      const returnedFromCheckout =
        params.has('razorpay_subscription') || params.get('razorpay') === 'success';
      // const returnedFromAddon = addonStatus === 'success' || addonStatus === 'canceled';
      if (returnedFromCheckout) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      /*
      if (addonStatus === 'canceled') {
        setNotice('Add-on purchase canceled — no charge was made.');
      } else if (addonStatus === 'success') {
        await runAddonSync({ manual: false });
      }
      */
      // Auto-reconcile when a subscription may be pending (just returned from
      // checkout, or status not yet active). Cheap no-op when nothing is pending.
      if (returnedFromCheckout || (acct && acct.subscription.status !== 'active')) {
        await runSync({ manual: false });
      }
    })().finally(() => setLoading(false));
  }, [load, runSync]);

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

  /*
  async function onConfirmBuyAddon() {
    if (!addonConfirmPack) return;
    const packId = addonConfirmPack.id;
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
      setAddonConfirmPack(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Purchase failed');
    } finally {
      setBuyingPackId(null);
    }
  }
  */

  async function onConfirmCancel() {
    const token = getToken();
    if (!token) return;
    setError('');
    setCanceling(true);
    try {
      const res = await api.billingCancel(token);
      setNotice(res.message || 'Subscription canceled.');
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cancel failed');
    } finally {
      setCanceling(false);
    }
  }

  const currentPlanId = account?.subscription.planId;
  // const quotaBonus = account?.subscription.quotaBonusThisPeriod ?? 0;

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
              {/* quotaBonus > 0 && (
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
              ) */}
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
                  <dt className="text-muted-foreground">
                    {account.subscription.status === 'trialing'
                      ? 'Trial ends on'
                      : 'Resets on'}
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {formatDate(subscriptionPeriodDate(account.subscription))}
                  </dd>
                </div>
              </dl>
              {account.subscription.status === 'trialing' && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {account.subscription.trialExpired ? (
                    <>
                      Your free trial has ended. Pick a plan below to continue sending.
                    </>
                  ) : (
                    <>
                      Free trial — {account.subscription.trialDaysLeft ?? 0} day
                      {account.subscription.trialDaysLeft === 1 ? '' : 's'} left. Trials do not
                      auto-renew; subscribe before it ends.
                    </>
                  )}
                </p>
              )}
              {account.subscription.status === 'active' &&
                account.subscription.planId &&
                (showCancelAtPeriodEndNotice(account.subscription) ? (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Your plan will not renew — active until {formatDate(account.subscription.periodResetAt)}.
                  </p>
                ) : (
                  <div className="mt-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                      Cancel subscription
                    </Button>
                  </div>
                ))}
              {account.subscription.status !== 'active' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={syncing}
                    onClick={() => runSync({ manual: true })}
                  >
                    Refresh payment status
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Already paid? Click to confirm and activate your plan.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quota add-ons — disabled for now
          {hasActiveSubscription && quotaPacks.length > 0 && (
            <div className="mb-8">...</div>
          )}
          */}

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

      {/* Add-on purchase confirm — disabled for now
      <ConfirmDialog ... />
      */}

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel subscription?"
        message={
          <>
            Your plan stays active until the end of the current billing period
            {account?.subscription.periodResetAt ? ` (${formatDate(account.subscription.periodResetAt)})` : ''}, then
            sending will stop. This cannot be undone — you would need to subscribe again.
          </>
        }
        confirmLabel="Yes, cancel"
        cancelLabel="Keep plan"
        loading={canceling}
        onConfirm={onConfirmCancel}
        onClose={() => !canceling && setConfirmOpen(false)}
      />
    </DashboardShell>
  );
}
