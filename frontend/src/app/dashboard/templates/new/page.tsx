'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { Button, Card, CardBody, Input, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';

export default function NewTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const admin = useTenantAdmin();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHtmlBody(searchParams.get('html') || '');
  }, [searchParams]);

  useEffect(() => {
    if (!admin) router.replace('/dashboard/templates');
  }, [admin, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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
    } finally {
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
    <DashboardShell title="New template" subtitle="HTML + merge tags">
      <Card className="max-w-3xl">
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Default subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Textarea
              label="HTML body"
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              rows={16}
              hint="Include {{unsubscribe_url}} for marketing emails"
              className="font-mono text-xs"
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" loading={loading}>Save template</Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </DashboardShell>
  );
}
