'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { TemplateBuilder } from '@/components/templates/TemplateBuilder';
import { Badge, Button, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken, getStoredUser } from '@/lib/auth';
import { isTenantAdmin } from '@/lib/roles';
import type { SessionUser, Template } from '@/lib/types';

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [hasUnsub, setHasUnsub] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const admin = isTenantAdmin(getStoredUser<SessionUser>());

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !id) return;
    const [t, p] = await Promise.all([
      api.getTemplate(token, id),
      api.previewTemplate(token, id).catch(() => null),
    ]);
    setTemplate(t.template);
    if (p) setHasUnsub(p.hasUnsubscribe);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit({ name, subject, htmlBody }: { name: string; subject: string; htmlBody: string }) {
    if (!template || !admin) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await api.updateTemplate(token, template._id, { name, subject, htmlBody });
      setHasUnsub(htmlBody.includes('{{unsubscribe_url}}'));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!template || !confirm('Delete this template?')) return;
    const token = getToken();
    if (!token) return;
    await api.deleteTemplate(token, template._id);
    router.push('/dashboard/templates');
  }

  /** Download template export file. */
  async function onExport(format: 'json' | 'html') {
    if (!template) return;
    const token = getToken();
    if (!token) return;
    setExporting(true);
    try {
      const blob = await api.exportTemplate(token, template._id, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${template.name.replace(/[^\w.-]+/g, '-')}.${format === 'html' ? 'html' : 'json'}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (!template) {
    return (
      <DashboardShell title="Template">
        <Skeleton className="h-64" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={template.name}
      subtitle={`Version ${template.version}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={hasUnsub ? 'success' : 'warning'}>
            {hasUnsub ? 'Unsubscribe OK' : 'Missing unsubscribe'}
          </Badge>
          <Button variant="outline" size="sm" loading={exporting} onClick={() => onExport('json')}>
            Export JSON
          </Button>
          <Button variant="outline" size="sm" loading={exporting} onClick={() => onExport('html')}>
            Export HTML
          </Button>
          {admin && (
            <Button variant="destructive" size="sm" onClick={onDelete}>Delete</Button>
          )}
        </div>
      }
    >
      <TemplateBuilder
        key={template._id}
        initialName={template.name}
        initialSubject={template.subject}
        initialHtml={template.htmlBody}
        saving={loading}
        error={error}
        submitLabel="Save changes"
        readOnly={!admin}
        onSubmit={onSubmit}
      />
    </DashboardShell>
  );
}
