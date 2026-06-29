'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { CampaignComposeForm } from '@/components/campaigns/CampaignComposeForm';
import { CampaignStepper } from '@/components/campaigns/CampaignStepper';
import { PreflightPanel } from '@/components/campaigns/PreflightPanel';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { CampaignPreflight } from '@/lib/types';

export default function NewCampaignPage() {
  const router = useRouter();
  const [preflight, setPreflight] = useState<CampaignPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const runPreflight = useCallback(async (templateId: string, listId: string) => {
    const token = getToken();
    if (!token || !templateId || !listId) {
      setPreflight(null);
      return;
    }
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

  return (
    <DashboardShell title="New campaign" subtitle="Bulk send — emails go to your whole list as soon as you confirm">
      <CampaignStepper current="compose" />

      <div className="grid gap-6 lg:grid-cols-2">
        <CampaignComposeForm
          submitLabel="Save draft & continue"
          loading={loading}
          error={error}
          onErrorClear={() => setError('')}
          onValidationError={setError}
          onValuesChange={({ templateId, listId }) => runPreflight(templateId, listId)}
          onSubmit={async (values, attachments) => {
            const token = getToken();
            if (!token) return;
            setLoading(true);
            setError('');
            try {
              const res = await api.createCampaign(token, { ...values, attachments });
              router.push(`/dashboard/campaigns/${res.campaign._id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Failed to create campaign');
            } finally {
              setLoading(false);
            }
          }}
        />

        <PreflightPanel preflight={preflight} waiting={preflightLoading} />
      </div>
    </DashboardShell>
  );
}
