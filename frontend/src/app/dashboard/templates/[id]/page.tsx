'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge, Button, Card, CardBody, Input, Skeleton, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken, getStoredUser } from '@/lib/auth';
import { isTenantAdmin } from '@/lib/roles';
import type { SessionUser, Template } from '@/lib/types';

export default function EditTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [preview, setPreview] = useState('');
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
    if (p) {
      setPreview(p.html);
      setHasUnsub(p.hasUnsubscribe);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!template || !admin) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      await api.updateTemplate(token, template._id, {
        name: template.name,
        subject: template.subject,
        htmlBody: template.htmlBody,
      });
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
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <form onSubmit={onSave} className="space-y-4">
              <Input
                label="Name"
                value={template.name}
                onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                required
                readOnly={!admin}
              />
              <Input
                label="Subject"
                value={template.subject}
                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                readOnly={!admin}
              />
              <Textarea
                label="HTML"
                value={template.htmlBody}
                onChange={(e) => setTemplate({ ...template, htmlBody: e.target.value })}
                rows={18}
                className="font-mono text-xs"
                readOnly={!admin}
              />
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              {admin ? (
                <Button type="submit" loading={loading}>Save</Button>
              ) : (
                <p className="text-sm text-muted-foreground">View only — contact an admin to edit templates.</p>
              )}
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="mb-3 text-sm font-medium">Preview (sample data)</p>
            <div
              className="min-h-[320px] overflow-auto rounded-lg border border-border bg-white p-4 text-sm"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  preview || '<p class="text-muted-foreground">Save to preview</p>'
                ),
              }}
            />
          </CardBody>
        </Card>
      </div>
    </DashboardShell>
  );
}
