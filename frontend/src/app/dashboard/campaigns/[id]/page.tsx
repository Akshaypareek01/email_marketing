'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge, Button, Card, CardBody, CardHeader, Skeleton, statusTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Campaign } from '@/lib/types';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !id) return;
    const res = await api.getCampaign(token, id);
    setCampaign(res.campaign);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!campaign || !['scheduled', 'sending'].includes(campaign.status)) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [campaign?.status, load]);

  async function onQueue() {
    const token = getToken();
    if (!token || !id) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.scheduleCampaign(token, id, { sendNow: true });
      setMessage(res.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to queue campaign');
    } finally {
      setLoading(false);
    }
  }

  if (!campaign) {
    return (
      <DashboardShell title="Campaign">
        <Skeleton className="h-64" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={campaign.name}
      subtitle={campaign.subject}
      action={
        campaign.status === 'draft' ? (
          <Button onClick={onQueue} loading={loading}>Start send</Button>
        ) : campaign.status === 'sending' ? (
          <Badge tone="info">Sending…</Badge>
        ) : (
          <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
        )
      }
    >
      {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Recipients', value: campaign.stats?.total ?? 0 },
          { label: 'Sent', value: campaign.stats?.sent ?? 0 },
          { label: 'Delivered', value: campaign.stats?.delivered ?? 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {campaign.preflightNotes?.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Pre-flight notes" />
          <CardBody>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {campaign.preflightNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="mt-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/campaigns')}>← Back to campaigns</Button>
      </div>
    </DashboardShell>
  );
}
