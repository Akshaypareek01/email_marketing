'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { TemplateBuilder } from '@/components/templates/TemplateBuilder';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';

export default function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const admin = useTenantAdmin();
  const [initialHtml, setInitialHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInitialHtml(searchParams.get('html') || '');
  }, [searchParams]);

  useEffect(() => {
    if (!admin) router.replace('/dashboard/templates');
  }, [admin, router]);

  async function onSubmit({ name, subject, htmlBody }: { name: string; subject: string; htmlBody: string }) {
    if (!admin) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.createTemplate(token, { name, subject, htmlBody });
      router.push(`/dashboard/templates/${res.template._id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create template');
      setLoading(false);
    }
  }

  if (!admin) {
    return (
      <DashboardShell title="New template">
        <ReadOnlyBanner />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="New template" subtitle="Design a beautiful email — no code needed">
      <TemplateBuilder
        initialHtml={initialHtml}
        saving={loading}
        error={error}
        submitLabel="Create template"
        onSubmit={onSubmit}
        onCancel={() => router.back()}
      />
    </DashboardShell>
  );
}
