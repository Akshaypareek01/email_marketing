'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatPrice } from '@/lib/format';
import type { AdminAnalytics, AdminOverview, PlatformDailyUsage } from '@/lib/types';
import { AdminShell } from '@/components/AdminShell';
import { Card, CardBody, CardHeader, Badge, Skeleton } from '@/components/ui';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'primary' | 'success' | 'danger' }) {
  const color = tone === 'success' ? 'var(--accent)' : tone === 'danger' ? 'var(--danger)' : 'var(--primary)';
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold" style={{ color }}>{value}</p>
      </CardBody>
    </Card>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [dailyUsage, setDailyUsage] = useState<PlatformDailyUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      api.adminOverview(token),
      api.adminAnalytics(token),
      api.adminGetPlatformSettings(token).catch(() => null),
    ])
      .then(([overview, a, platform]) => {
        setData(overview);
        setAnalytics(a.analytics);
        if (platform && typeof platform.dailyLimit === 'number') setDailyLimit(platform.dailyLimit);
        if (platform?.dailyUsage) setDailyUsage(platform.dailyUsage);
      })
      .catch(() => {
        setData(null);
        setAnalytics(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="Platform overview">
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total tenants" value={data?.tenants.total ?? 0} />
            <Stat label="Active tenants" value={data?.tenants.active ?? 0} tone="success" />
            <Stat label="Suspended" value={data?.tenants.suspended ?? 0} tone="danger" />
            <Stat label="Active plans" value={data?.plans ?? 0} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="MRR"
              value={analytics ? formatPrice(analytics.mrrMinor, analytics.currency) : '—'}
              tone="success"
            />
            <Stat
              label="Revenue (this month)"
              value={analytics ? formatPrice(analytics.revenue.thisMonthMinor, analytics.currency) : '—'}
            />
            <Stat label="Active subscriptions" value={analytics?.subscriptions.active ?? '—'} />
            <Stat label="New tenants (30d)" value={analytics?.cohort30d.newTenants ?? '—'} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Stat label="Users" value={data?.users ?? 0} />
            <Stat label="Domains" value={data?.domains ?? 0} />
            <Stat label="Plans" value={data?.plans ?? 0} />
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Sender account health"
              subtitle="Account-wide deliverability vs limits (5% bounce · 0.1% complaint)"
              action={
                data?.ses.platformProtect?.active ? (
                  <Badge tone="warning">Auto-protect active</Badge>
                ) : (
                  <Badge tone="success">Monitoring</Badge>
                )
              }
            />
            <CardBody>
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  { label: 'Bounce rate', val: data?.ses.bounceRate, max: '5%' },
                  { label: 'Complaint rate', val: data?.ses.complaintRate, max: '0.1%' },
                  { label: 'Sent today', val: data?.ses.dailySent, max: data?.ses.windowSent ?? '—' },
                ].map((m) => (
                  <div key={m.label}>
                    <p className="text-sm text-muted-foreground">{m.label}</p>
                    <p className="mt-1 text-2xl font-bold">
                      {m.val == null ? '—' : m.val}
                      {m.label !== 'Sent today' && m.val != null ? '%' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.label === 'Sent today' ? `window ${m.max}` : `limit ${String(m.max)}`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Full deliverability control center and tenant risk ranking:{' '}
                <Link href="/admin/reputation" className="text-[var(--primary)] hover:underline">
                  Sender Health
                </Link>
              </p>
            </CardBody>
          </Card>

          <Card className="mt-6">
            <CardHeader
              title="Sending usage & estimated cost"
              subtitle="Live account quota plus month-to-date volume and estimated spend"
              action={
                data?.ses.account ? (
                  <Badge tone={data.ses.account.productionAccessEnabled ? 'success' : 'warning'}>
                    {data.ses.account.productionAccessEnabled ? 'Production access' : 'Sandbox'}
                  </Badge>
                ) : (
                  <Badge tone="warning">Account unavailable</Badge>
                )
              }
            />
            <CardBody>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Platform 24h limit</p>
                  <p className="mt-1 text-2xl font-bold">
                    {dailyLimit == null ? '—' : dailyLimit === 0 ? 'Unlimited' : dailyLimit.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <Link href="/admin/reputation" className="text-[var(--primary)] hover:underline">
                      edit in Sender Health
                    </Link>
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sent / remaining (24h)</p>
                  <p className="mt-1 text-2xl font-bold">
                    {dailyUsage ? dailyUsage.count.toLocaleString() : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dailyUsage && dailyLimit
                      ? dailyLimit === 0
                        ? 'unlimited remaining'
                        : `${(dailyUsage.remaining ?? 0).toLocaleString()} remaining`
                      : `Send rate ${data?.ses.account?.maxSendRate ?? '—'}/s`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sent this month</p>
                  <p className="mt-1 text-2xl font-bold">
                    {data?.ses.usage?.monthToDateSent != null
                      ? data.ses.usage.monthToDateSent.toLocaleString()
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">month-to-date</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated cost</p>
                  <p className="mt-1 text-2xl font-bold" style={{ color: 'var(--accent)' }}>
                    {data?.ses.usage
                      ? `$${data.ses.usage.estimatedCostUsd.toFixed(2)}`
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data?.ses.usage ? `@ $${data.ses.usage.costPer1000Usd}/1k this month` : 'this month'}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Revenue, plan distribution and best customers:{' '}
                <Link href="/admin/insights" className="text-[var(--primary)] hover:underline">
                  Insights
                </Link>
              </p>
            </CardBody>
          </Card>
        </>
      )}
    </AdminShell>
  );
}
