'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { CampaignComposeForm, type CampaignComposeValues } from '@/components/campaigns/CampaignComposeForm';
import { CampaignStepper } from '@/components/campaigns/CampaignStepper';
import { PreflightPanel } from '@/components/campaigns/PreflightPanel';
import { Badge, Button, Card, CardBody, CardHeader, Skeleton, statusTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Campaign, CampaignPreflight } from '@/lib/types';

function resolveId(ref: string | { _id: string } | undefined): string {
  if (!ref) return '';
  return typeof ref === 'object' ? ref._id : ref;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [preflight, setPreflight] = useState<CampaignPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !id) return;
    const res = await api.getCampaign(token, id);
    setCampaign(res.campaign);
    return res.campaign;
  }, [id]);

  const runPreflight = useCallback(async (templateId: string, listId: string) => {
    const token = getToken();
    if (!token || !templateId || !listId) return;
    setPreflightLoading(true);
    try {
      const result = await api.preflightCampaign(token, { templateId, listId });
      setPreflight(result);
    } catch {
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then((c) => {
      if (!c) return;
      const templateId = resolveId(c.templateId);
      const listId = resolveId(c.listId);
      if (templateId && listId) runPreflight(templateId, listId);
    });
  }, [load, runPreflight]);

  useEffect(() => {
    if (!campaign || !['scheduled', 'sending'].includes(campaign.status)) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [campaign?.status, load]);

  const composeInitial = useMemo<Partial<CampaignComposeValues> | undefined>(() => {
    if (!campaign) return undefined;
    return {
      name: campaign.name,
      subject: campaign.subject,
      templateId: resolveId(campaign.templateId),
      listId: resolveId(campaign.listId),
    };
  }, [campaign]);

  async function onQueue() {
    const token = getToken();
    if (!token || !id) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.scheduleCampaign(token, id, { sendNow: true });
      setMessage(res.message);
      setEditing(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.payload && typeof err.payload === 'object' && 'preflight' in err.payload) {
          setPreflight(err.payload.preflight as CampaignPreflight);
        }
      } else {
        setError('Failed to queue campaign');
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSaveDraft(values: CampaignComposeValues) {
    const token = getToken();
    if (!token || !id) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateCampaign(token, id, values);
      setCampaign(res.campaign);
      setPreflight(res.preflight);
      setEditing(false);
      setMessage('Campaign updated.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (!campaign) {
    return (
      <DashboardShell title="Campaign">
        <Skeleton className="h-64" />
      </DashboardShell>
    );
  }

  const canEdit = campaign.status === 'draft';
  const canSend = canEdit && preflight?.ok && !editing;

  return (
    <DashboardShell
      title={campaign.name}
      subtitle={campaign.subject}
      action={
        canEdit ? (
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <Button variant="outline" onClick={() => setEditing(false)}>
                Cancel edit
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit campaign
              </Button>
            )}
            <Button onClick={onQueue} loading={loading} disabled={!canSend} title={!canSend ? 'Fix pre-flight blockers first' : undefined}>
              Send to {(campaign.stats?.total ?? preflight?.recipientCount ?? 0).toLocaleString()} contacts now
            </Button>
          </div>
        ) : campaign.status === 'sending' ? (
          <Badge tone="info">Sending…</Badge>
        ) : (
          <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
        )
      }
    >
      <CampaignStepper current={editing ? 'compose' : 'send'} />

      {message && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {canEdit && !preflight?.ok && !editing && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Fix the pre-flight blockers below before starting send, or edit the campaign to change your list or template.
        </p>
      )}

      {editing ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <CampaignComposeForm
            key={campaign._id}
            initial={composeInitial}
            submitLabel="Save changes"
            loading={saving}
            error={saveError}
            onErrorClear={() => setSaveError('')}
            onValidationError={setSaveError}
            onValuesChange={({ templateId, listId }) => runPreflight(templateId, listId)}
            onSubmit={async (values) => onSaveDraft(values)}
          />
          <PreflightPanel preflight={preflight} waiting={preflightLoading} />
        </div>
      ) : (
        <>
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Campaign summary" />
              <CardBody>
                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Template</dt>
                    <dd className="font-medium">
                      {typeof campaign.templateId === 'object' ? campaign.templateId.name : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">List</dt>
                    <dd className="font-medium">
                      {typeof campaign.listId === 'object' ? campaign.listId.name : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
                    </dd>
                  </div>
                </dl>
              </CardBody>
            </Card>
            <PreflightPanel preflight={preflight} waiting={preflightLoading} />
          </div>
        </>
      )}

      <div className="mt-6">
        <Button variant="ghost" onClick={() => router.push('/dashboard/campaigns')}>
          ← Back to campaigns
        </Button>
      </div>
    </DashboardShell>
  );
}
