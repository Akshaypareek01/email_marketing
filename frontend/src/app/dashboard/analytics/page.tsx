'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { QuotaBar } from '@/components/dashboard/QuotaBar';
import { ReputationWidget } from '@/components/dashboard/ReputationWidget';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge, Card, CardBody, CardHeader, Skeleton, statusTone } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { AccountAnalytics, AccountOverview } from '@/lib/types';

export default function AnalyticsPage() {
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [analytics, setAnalytics] = useState<AccountAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      api.accountOverview(token).catch(() => null),
      api.accountAnalytics(token).catch(() => null),
    ])
      .then(([acct, data]) => {
        setAccount(acct);
        setAnalytics(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const maxVolume = Math.max(...(analytics?.sendVolume.map((d) => d.count) || [1]), 1);

  return (
    <DashboardShell title="Analytics" subtitle="Deliverability, quota usage, and send performance">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {account && (
            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              <QuotaBar
                used={account.subscription.emailsSentThisPeriod}
                total={account.subscription.monthlyEmailQuota}
                remaining={account.subscription.remaining}
                usedPct={account.subscription.usedPct}
                planName={account.subscription.planName}
              />
              <ReputationWidget
                bounceRate={account.reputation.bounceRate}
                complaintRate={account.reputation.complaintRate}
                sent={account.reputation.sent}
              />
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Contacts" value={analytics?.contacts ?? 0} href="/dashboard/contacts" />
            <StatCard label="Sent (30d events)" value={analytics?.events.sent ?? 0} />
            <StatCard label="Delivered" value={analytics?.events.delivered ?? 0} tone="success" />
            <StatCard label="Bounced" value={analytics?.events.bounced ?? 0} tone={(analytics?.events.bounced ?? 0) > 0 ? 'warning' : 'default'} />
          </div>

          {analytics?.sendVolume.length ? (
            <Card className="mb-6">
              <CardHeader title="Send volume (30 days)" subtitle="Event count per day" />
              <CardBody>
                <div className="flex h-40 items-end gap-1">
                  {analytics.sendVolume.map((d) => (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t bg-[var(--primary)]/80 transition-all"
                        style={{ height: `${Math.max(4, (d.count / maxVolume) * 100)}%` }}
                        title={`${d.date}: ${d.count}`}
                      />
                      <span className="hidden text-[9px] text-muted-foreground sm:block">
                        {d.date.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Recent campaigns" />
            <CardBody className="p-0">
              {!analytics?.topCampaigns.length ? (
                <p className="p-5 text-sm text-muted-foreground">No campaigns yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Sent</th>
                      <th className="px-4 py-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.topCampaigns.map((c) => (
                      <tr key={c._id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{c.stats?.sent ?? 0}</td>
                        <td className="px-4 py-3 tabular-nums">{c.stats?.total ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </DashboardShell>
  );
}
