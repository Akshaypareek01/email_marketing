'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Skeleton, statusTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import type { Campaign } from '@/lib/types';

export default function CampaignsPage() {
  const admin = useTenantAdmin();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.listCampaigns(token).then((r) => setCampaigns(r.campaigns)).finally(() => setLoading(false));
  }, []);

  async function onSchedule(id: string) {
    const token = getToken();
    if (!token) return;
    setError('');
    try {
      const res = await api.scheduleCampaign(token, id, { sendNow: true });
      alert(res.message);
      const updated = await api.listCampaigns(token);
      setCampaigns(updated.campaigns);
    } catch (err) {
      if (err instanceof ApiError) {
        const pre = err.payload as { preflight?: { blockers?: string[] } } | undefined;
        const blockers = pre?.preflight?.blockers;
        setError(
          blockers?.length
            ? `${err.message}: ${blockers.join('; ')}`
            : err.message
        );
      } else {
        setError('Schedule failed');
      }
    }
  }

  async function onDelete(id: string) {
    const token = getToken();
    if (!token || !confirm('Delete campaign?')) return;
    await api.deleteCampaign(token, id);
    setCampaigns((prev) => prev.filter((c) => c._id !== id));
  }

  return (
    <DashboardShell
      title="Campaigns"
      subtitle="Bulk email to everyone on a contact list — sends start immediately"
      action={<ButtonLink href="/dashboard/campaigns/new">New bulk send</ButtonLink>}
    >
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {loading ? (
        <Skeleton className="h-48" />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          message="Create a campaign from a list and template. Bulk send runs via throttled worker (queued after pre-flight)."
          action={<ButtonLink href="/dashboard/campaigns/new" variant="primary">Create campaign</ButtonLink>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">List</th>
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Recipients</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c._id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/dashboard/campaigns/${c._id}`} className="hover:text-[var(--primary)]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {typeof c.listId === 'object' ? c.listId.name : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {typeof c.templateId === 'object' ? c.templateId.name : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.stats?.total ?? 0}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {c.status === 'draft' && (
                        <Button size="sm" onClick={() => onSchedule(c._id)}>Queue send</Button>
                      )}
                      {admin && (
                        <Button variant="ghost" size="sm" onClick={() => onDelete(c._id)}>Delete</Button>
                      )}
                    </div>
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
