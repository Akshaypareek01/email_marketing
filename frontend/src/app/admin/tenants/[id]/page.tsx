'use client';

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { beginImpersonation, getRefreshToken, getStoredUser, getToken, setSession } from '@/lib/auth';
import type { AdminTenantDetail, SessionUser } from '@/lib/types';
import { AdminShell } from '@/components/AdminShell';
import { Card, CardBody, CardHeader, Badge, Button, statusTone, Skeleton, EmptyState, Input, Textarea } from '@/components/ui';

function Metric({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={danger ? { color: 'var(--danger)' } : undefined}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<AdminTenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeSeverity, setNoticeSeverity] = useState<'info' | 'warning' | 'danger'>('info');
  const [noticeSending, setNoticeSending] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      setData(await api.adminGetTenant(token, id));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function toggleSending() {
    const token = getToken();
    if (!token || !data) return;
    const paused = !data.tenant.sending?.paused;
    if (paused && !confirm(`Pause sending for "${data.tenant.name}"?`)) return;
    setBusy(true);
    try {
      const res = await api.adminSetTenantSending(token, id, paused, paused ? 'Paused by operator' : '');
      setData({ ...data, tenant: { ...data.tenant, sending: res.tenant.sending } });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    const token = getToken();
    if (!token || !data) return;
    const next = data.tenant.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend "${data.tenant.name}"? All sending stops immediately.`)) return;
    setBusy(true);
    try {
      const res = await api.adminSetTenantStatus(token, id, next);
      setData({ ...data, tenant: { ...data.tenant, status: res.tenant.status } });
    } finally {
      setBusy(false);
    }
  }

  async function impersonate() {
    const token = getToken();
    const user = getStoredUser<SessionUser>();
    if (!token || !user || !confirm(`Open dashboard as ${data?.tenant.name} admin?`)) return;
    setBusy(true);
    try {
      const res = await api.adminImpersonateTenant(token, id);
      beginImpersonation({
        token,
        refreshToken: getRefreshToken() || undefined,
        user,
      });
      setSession(res.token, res.user, res.refreshToken);
      router.push('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  async function sendNotice(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !noticeTitle.trim() || !noticeMessage.trim()) return;
    setNoticeSending(true);
    try {
      await api.adminCreateTenantNotice(token, id, {
        title: noticeTitle.trim(),
        message: noticeMessage.trim(),
        severity: noticeSeverity,
      });
      setNoticeTitle('');
      setNoticeMessage('');
      setNoticeSeverity('info');
    } finally {
      setNoticeSending(false);
    }
  }

  if (loading) {
    return <AdminShell title="Tenant"><Skeleton className="h-64" /></AdminShell>;
  }
  if (!data) {
    return (
      <AdminShell title="Tenant">
        <EmptyState title="Tenant not found" message="It may have been removed." action={<Link className="text-[var(--primary)]" href="/admin/tenants">Back to tenants</Link>} />
      </AdminShell>
    );
  }

  const { tenant, users, domains, reputation } = data;
  const sub = tenant.subscription;
  const paused = tenant.sending?.paused;

  return (
    <AdminShell
      title={tenant.name}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={busy} onClick={impersonate}>
            Impersonate admin
          </Button>
          <Button size="sm" variant={paused ? 'secondary' : 'outline'} loading={busy} onClick={toggleSending}>
            {paused ? 'Resume sending' : 'Pause sending'}
          </Button>
          <Button size="sm" variant={tenant.status === 'active' ? 'destructive' : 'secondary'} loading={busy} onClick={toggleStatus}>
            {tenant.status === 'active' ? 'Suspend' : 'Reactivate'}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/tenants" className="text-muted-foreground hover:text-foreground">← Tenants</Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono text-xs text-muted-foreground">{tenant.slug}</span>
        <Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge>
        {paused && <Badge tone="warning">sending paused</Badge>}
      </div>

      {paused && tenant.sending?.pauseReason && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium capitalize">{tenant.sending.pauseSource || 'manual'} pause:</span> {tenant.sending.pauseReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Reputation" subtitle="Rolling window — drives auto-pause" />
          <CardBody>
            <div className="grid grid-cols-2 gap-5">
              <Metric label="Bounce rate" value={`${reputation.bounceRate}%`} sub="limit 5%" danger={reputation.bounceRate >= 4} />
              <Metric label="Complaint rate" value={`${reputation.complaintRate}%`} sub="limit 0.1%" danger={reputation.complaintRate >= 0.08} />
              <Metric label="Sent (window)" value={reputation.sent.toLocaleString('en-IN')} />
              <Metric label="Bounced / Complaints" value={`${reputation.bounced} / ${reputation.complained}`} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Subscription" />
          <CardBody>
            <div className="grid grid-cols-2 gap-5">
              <Metric label="Status" value={sub?.status ?? '—'} />
              <Metric label="Monthly quota" value={(sub?.monthlyEmailQuota ?? 0).toLocaleString('en-IN')} />
              <Metric label="Used this period" value={(sub?.emailsSentThisPeriod ?? 0).toLocaleString('en-IN')} />
              <Metric label="Period start" value={sub?.periodStart ? new Date(sub.periodStart).toLocaleDateString() : '—'} />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={`Users (${users.length})`} />
        <CardBody>
          {users.length === 0 ? <p className="text-sm text-muted-foreground">No users.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className="border-b border-border last:border-0">
                    <td className="py-2 font-medium">{u.name}</td>
                    <td className="py-2 text-muted-foreground">{u.email}</td>
                    <td className="py-2 text-right"><Badge tone="neutral">{u.role}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Send notice" subtitle="One-off message shown on the tenant dashboard" />
        <CardBody>
          <form onSubmit={sendNotice} className="space-y-4">
            <Input
              label="Title"
              value={noticeTitle}
              onChange={(e) => setNoticeTitle(e.target.value)}
              required
            />
            <Textarea
              label="Message"
              rows={3}
              value={noticeMessage}
              onChange={(e) => setNoticeMessage(e.target.value)}
              required
            />
            <label className="flex flex-col text-sm">
              <span className="mb-1.5 font-medium">Severity</span>
              <select
                className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                value={noticeSeverity}
                onChange={(e) => setNoticeSeverity(e.target.value as 'info' | 'warning' | 'danger')}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="danger">Danger</option>
              </select>
            </label>
            <Button type="submit" loading={noticeSending} size="sm">
              Post notice
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title={`Domains (${domains.length})`} />
        <CardBody>
          {domains.length === 0 ? <p className="text-sm text-muted-foreground">No domains.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {domains.map((d) => (
                  <tr key={d._id} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono text-xs">{d.name}</td>
                    <td className="py-2 text-right"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </AdminShell>
  );
}
