'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { AdminBillingSettings } from '@/lib/types';
import { Card, CardBody, CardHeader, Badge, Button, Skeleton } from '@/components/ui';

type BillingMode = 'direct' | 'provider';
type BillingProviderName = 'stripe' | 'razorpay';

/**
 * Super-admin control for platform billing mode and payment gateway.
 */
export function AdminBillingGatewaySettings() {
  const [settings, setSettings] = useState<AdminBillingSettings | null>(null);
  const [mode, setMode] = useState<BillingMode>('provider');
  const [provider, setProvider] = useState<BillingProviderName>('razorpay');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.adminGetBillingSettings(token);
      setSettings(res);
      setMode(res.billing.mode);
      setProvider(res.billing.provider);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await api.adminUpdateBillingSettings(token, { mode, provider });
      setSettings(res);
      setNotice('Payment settings saved. New checkouts use this gateway.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save billing settings');
    } finally {
      setSaving(false);
    }
  }

  const creds = settings?.credentials;
  const gatewayReady =
    mode === 'direct' ||
    (provider === 'razorpay' ? creds?.razorpayConfigured : creds?.stripeConfigured);

  return (
    <Card className="mb-8">
      <CardHeader
        title="Payment gateway"
        subtitle="Choose how tenants pay for plans. API keys stay in server env — only the active gateway is selected here."
        action={
          loading ? null : (
            <Badge tone={gatewayReady ? 'success' : 'warning'}>
              {mode === 'direct' ? 'Direct (no payments)' : gatewayReady ? `${provider} ready` : `${provider} keys missing`}
            </Badge>
          )
        }
      />
      <CardBody>
        {loading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Billing mode</legend>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    { id: 'provider', label: 'Payment gateway', hint: 'Stripe or Razorpay checkout' },
                    { id: 'direct', label: 'Direct assign', hint: 'Skip payments (dev / internal)' },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer flex-col rounded-lg border px-4 py-3 text-sm transition ${
                      mode === opt.id ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-border'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="billing-mode"
                        value={opt.id}
                        checked={mode === opt.id}
                        onChange={() => setMode(opt.id)}
                        className="accent-[var(--primary)]"
                      />
                      {opt.label}
                    </span>
                    <span className="mt-1 pl-6 text-xs text-muted-foreground">{opt.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === 'provider' && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Active gateway</legend>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      { id: 'razorpay', label: 'Razorpay', hint: 'INR subscriptions & webhooks' },
                      { id: 'stripe', label: 'Stripe', hint: 'Global cards & subscriptions' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer flex-col rounded-lg border px-4 py-3 text-sm transition ${
                        provider === opt.id ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-border'
                      }`}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <input
                          type="radio"
                          name="billing-provider"
                          value={opt.id}
                          checked={provider === opt.id}
                          onChange={() => setProvider(opt.id)}
                          className="accent-[var(--primary)]"
                        />
                        {opt.label}
                      </span>
                      <span className="mt-1 pl-6 text-xs text-muted-foreground">{opt.hint}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Set <code className="rounded bg-muted px-1">RAZORPAY_*</code> or{' '}
                  <code className="rounded bg-muted px-1">STRIPE_*</code> in backend env. Plans need matching{' '}
                  <code className="rounded bg-muted px-1">razorpayPlanId</code> /{' '}
                  <code className="rounded bg-muted px-1">stripePriceId</code> below.
                </p>
              </fieldset>
            )}

            {settings?.billing.source === 'env' && (
              <p className="text-xs text-amber-700">
                Using env defaults until you save — then platform DB overrides <code>BILLING_MODE</code> /{' '}
                <code>BILLING_PROVIDER</code>.
              </p>
            )}

            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

            <Button type="button" size="sm" loading={saving} onClick={save} aria-label="Save payment gateway settings">
              Save payment settings
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
