'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { AdminOverview, PlatformProtectState, TenantRiskRow, PlatformDailyUsage } from '@/lib/types';
import { AdminShell } from '@/components/AdminShell';
import { Card, CardBody, CardHeader, Badge, Button, Input, Skeleton, statusTone } from '@/components/ui';

function Gauge({
  label,
  value,
  limit,
  danger,
}: {
  label: string;
  value: number | null;
  limit: string;
  danger?: boolean;
}) {
  const overLimit = value != null && parseFloat(String(limit)) > 0 && value >= parseFloat(String(limit)) * 0.75;
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-3xl font-bold"
        style={{ color: danger || overLimit ? 'var(--danger)' : 'var(--primary)' }}
      >
        {value == null ? '—' : `${value}%`}
      </p>
      <p className="text-xs text-muted-foreground">AWS limit {limit}</p>
    </div>
  );
}

/**
 * Super-admin SES health: kill switch, platform metrics, auto-protect status, tenant risk ranking.
 */
export default function AdminReputationPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [ranking, setRanking] = useState<TenantRiskRow[]>([]);
  const [platformProtect, setPlatformProtect] = useState<PlatformProtectState | null>(null);
  const [halted, setHalted] = useState(false);
  const [dailyLimit, setDailyLimit] = useState<number>(0);
  const [dailyUsage, setDailyUsage] = useState<PlatformDailyUsage | null>(null);
  const [limitInput, setLimitInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingLimit, setSavingLimit] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [overview, platform, risk] = await Promise.all([
      api.adminOverview(token).catch(() => null),
      api.adminGetPlatformSettings(token).catch(() => ({ platformSendingHalted: false })),
      api.adminReputationRisk(token, 20).catch(() => ({ ranking: [], platformProtect: null })),
    ]);
    setData(overview);
    setHalted(platform.platformSendingHalted);
    if ('dailyLimit' in platform && typeof platform.dailyLimit === 'number') {
      setDailyLimit(platform.dailyLimit);
      setLimitInput(String(platform.dailyLimit));
    }
    if ('dailyUsage' in platform && platform.dailyUsage) setDailyUsage(platform.dailyUsage);
    setPlatformProtect(
      risk.platformProtect ??
        ('platformProtect' in platform ? platform.platformProtect : null) ??
        null
    );
    setRanking(risk.ranking);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function toggleHalt() {
    const token = getToken();
    if (!token) return;
    const next = !halted;
    if (next && !confirm('Halt ALL platform sending immediately?')) return;
    setBusy(true);
    try {
      const res = await api.adminSetPlatformHalt(token, next);
      setHalted(res.platformSendingHalted);
    } finally {
      setBusy(false);
    }
  }

  async function runGuard() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      await api.adminRunReputationGuard(token);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit() {
    const token = getToken();
    if (!token) return;
    const next = Math.max(0, Math.floor(Number(limitInput)));
    if (!Number.isFinite(next)) return;
    setSavingLimit(true);
    try {
      const res = await api.adminSetPlatformDailyLimit(token, next);
      setDailyLimit(res.dailyLimit);
      setLimitInput(String(res.dailyLimit));
      setDailyUsage(res.dailyUsage);
    } finally {
      setSavingLimit(false);
    }
  }

  const protectActive = Boolean(platformProtect?.active);

  return (
    <AdminShell
      title="SES Health"
      action={
        <Badge tone={halted ? 'danger' : protectActive ? 'warning' : 'success'}>
          {halted ? 'Sending halted' : protectActive ? 'Auto-protect active' : 'Sending active'}
        </Badge>
      }
    >
      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Kill switch" subtitle="Instantly halt or resume all outbound sending platform-wide." />
            <CardBody className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant={halted ? 'secondary' : 'destructive'}
                size="sm"
                loading={busy}
                onClick={toggleHalt}
                aria-label={halted ? 'Resume platform sending' : 'Halt platform sending'}
              >
                {halted ? 'Resume sending' : 'Halt all sending'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={runGuard}
                aria-label="Run platform reputation guard now"
              >
                Run auto-protect check
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Platform 24h send limit"
              subtitle="Total emails all tenants combined may send per rolling 24 hours. Sending blocks platform-wide once reached."
              action={
                dailyUsage?.exceeded ? <Badge tone="danger">Limit reached</Badge> : <Badge tone="success">Within limit</Badge>
              }
            />
            <CardBody>
              <div className="mb-4 grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">Sent (24h window)</p>
                  <p className="mt-1 text-3xl font-bold">{(dailyUsage?.count ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current limit</p>
                  <p className="mt-1 text-3xl font-bold">
                    {dailyLimit === 0 ? 'Unlimited' : dailyLimit.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="mt-1 text-3xl font-bold" style={{ color: 'var(--accent)' }}>
                    {dailyLimit === 0 ? '∞' : (dailyUsage?.remaining ?? dailyLimit).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-48">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Set 24h limit (0 = unlimited)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                  />
                </div>
                <Button type="button" size="sm" loading={savingLimit} onClick={saveLimit}>
                  Save limit
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Default 50,000. Tenants are still independently capped by their own plan&apos;s monthly quota.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Account-wide deliverability"
              subtitle="Rolling-window aggregate across all tenants on the shared SES account."
            />
            <CardBody>
              <div className="grid gap-6 sm:grid-cols-3">
                <Gauge label="Bounce rate" value={data?.ses.bounceRate ?? null} limit="5%" danger />
                <Gauge label="Complaint rate" value={data?.ses.complaintRate ?? null} limit="0.1%" danger />
                <div>
                  <p className="text-sm text-muted-foreground">Sent today</p>
                  <p className="mt-1 text-3xl font-bold">{data?.ses.dailySent ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">window sent {data?.ses.windowSent ?? '—'}</p>
                </div>
              </div>
              {platformProtect?.lastEvaluatedAt && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Auto-protect last evaluated {new Date(platformProtect.lastEvaluatedAt).toLocaleString()}
                  {platformProtect.severityRatio != null && platformProtect.triggerRatio != null
                    ? ` · severity ${Math.round(platformProtect.severityRatio * 100)}% of AWS limit (trigger ${Math.round(platformProtect.triggerRatio * 100)}%)`
                    : ''}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Tenant risk ranking"
              subtitle="Highest-risk senders paused first when platform metrics approach AWS thresholds (PRD §6.4)."
            />
            <CardBody>
              {ranking.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenants with enough send volume for risk scoring yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Tenant deliverability risk ranking">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Tenant</th>
                        <th className="pb-2 pr-4 font-medium">Risk</th>
                        <th className="pb-2 pr-4 font-medium">Bounce</th>
                        <th className="pb-2 pr-4 font-medium">Complaint</th>
                        <th className="pb-2 pr-4 font-medium">Sent</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row) => (
                        <tr key={row.tenantId} className="border-b border-border/50">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/admin/tenants/${row.tenantId}`}
                              className="font-medium text-[var(--primary)] hover:underline"
                            >
                              {row.name}
                            </Link>
                          </td>
                          <td className="py-3 pr-4 font-mono">{row.riskScore.toFixed(2)}</td>
                          <td className="py-3 pr-4">{row.bounceRate}%</td>
                          <td className="py-3 pr-4">{row.complaintRate}%</td>
                          <td className="py-3 pr-4">{row.sent}</td>
                          <td className="py-3">
                            <Badge tone={statusTone(row.sendingPaused ? 'restricted' : row.status)}>
                              {row.sendingPaused ? `paused (${row.pauseSource || 'unknown'})` : row.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Protection stack" subtitle="Automated guardrails active in production code." />
            <CardBody>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Platform auto-protect</span> — pauses up to 3
                  highest-risk tenants when aggregate bounce/complaint hits 75% of AWS limits.
                </li>
                <li>
                  <span className="font-medium text-foreground">Per-tenant auto-pause</span> — warn then restrict
                  on tenant-level threshold breach.
                </li>
                <li>
                  <span className="font-medium text-foreground">Platform 24h cap</span> — admin-set ceiling on total
                  platform sends per rolling 24h; tenants are otherwise limited only by their monthly plan quota.
                </li>
                <li>
                  <span className="font-medium text-foreground">List hygiene</span> — blocks high role-address /
                  disposable ratios at preflight.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
