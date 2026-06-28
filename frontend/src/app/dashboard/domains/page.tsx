'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Button, Card, CardBody, EmptyState, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import type { Domain, AccountOverview } from '@/lib/types';

export default function DomainsPage() {
  const admin = useTenantAdmin();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [domainData, overviewData] = await Promise.all([
      api.listDomains(token),
      api.accountOverview(token).catch(() => null),
    ]);
    setDomains(domainData.domains as Domain[]);
    if (overviewData) setOverview(overviewData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sub = overview?.subscription;
  const maxDomains = sub?.maxDomains ?? 0;
  const usedDomains = domains.length;
  const trialExpired = Boolean(sub?.trialExpired);
  const atLimit = maxDomains > 0 && usedDomains >= maxDomains;
  const canAdd = admin && !trialExpired && !atLimit;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const token = getToken();
    if (!token) return;

    try {
      await api.createDomain(token, name.trim().toLowerCase());
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add domain');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="Domains"
      subtitle="Connect and verify your sending domains"
    >
      {!admin && <ReadOnlyBanner message="View-only — contact an admin to add or verify domains." />}

      {/* Trial / plan status banner */}
      {admin && sub && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">
              {sub.status === 'trialing'
                ? trialExpired
                  ? 'Free trial ended'
                  : `Free trial · ${sub.trialDaysLeft ?? 0} day${sub.trialDaysLeft === 1 ? '' : 's'} left`
                : `${sub.planName || 'Current plan'}`}
            </span>
            <span className="text-muted-foreground">
              Domains: {usedDomains} / {maxDomains > 0 ? maxDomains : '∞'}
            </span>
          </div>
          {(trialExpired || atLimit) && (
            <Link
              href="/dashboard/billing"
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {trialExpired ? 'Choose a plan' : 'Upgrade plan'}
            </Link>
          )}
        </div>
      )}

      {admin && (
      <Card className="mb-6">
        <CardBody>
          {trialExpired ? (
            <p className="text-sm text-muted-foreground">
              Your free trial has ended.{' '}
              <Link href="/dashboard/billing" className="font-semibold text-[var(--primary)] hover:underline">
                Choose a plan
              </Link>{' '}
              to add domains and resume sending.
            </p>
          ) : atLimit ? (
            <p className="text-sm text-muted-foreground">
              You&apos;ve used all {maxDomains} domain{maxDomains === 1 ? '' : 's'} on your plan.{' '}
              <Link href="/dashboard/billing" className="font-semibold text-[var(--primary)] hover:underline">
                Upgrade
              </Link>{' '}
              to add more.
            </p>
          ) : (
            <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <Input
                  label="Domain name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="example.com"
                  required
                  disabled={!canAdd}
                />
              </div>
              <Button type="submit" loading={loading} disabled={!canAdd}>
                Add domain
              </Button>
            </form>
          )}
          {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        </CardBody>
      </Card>
      )}

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          message="Add your first domain to start verifying DNS records for sending."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {domains.map((d) => (
                <tr key={d._id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {admin ? (
                      <Link
                        href={`/dashboard/domains/${d._id}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        DNS & verify
                      </Link>
                    ) : (
                      <Link href={`/dashboard/domains/${d._id}`} className="text-muted-foreground hover:underline">
                        View DNS
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
