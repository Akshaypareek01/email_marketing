'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken, getStoredUser } from '@/lib/auth';
import { isTenantAdmin } from '@/lib/roles';
import type { BlockTemplate, SessionUser, Template } from '@/lib/types';

const MERGE_TAGS = ['{{first_name}}', '{{last_name}}', '{{email}}', '{{company}}', '{{unsubscribe_url}}'];

const STARTER_HTML = `<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1>Hello {{first_name}}</h1>
  <p>Thanks for subscribing.</p>
  <p style="font-size: 12px; color: #64748b;">
    <a href="{{unsubscribe_url}}">Unsubscribe</a>
  </p>
</body>
</html>`;

/**
 * Parse imported template file (.json export or raw .html).
 */
async function parseTemplateFile(file: File): Promise<{ name: string; subject: string; htmlBody: string }> {
  const text = await file.text();
  if (file.name.endsWith('.json') || text.trimStart().startsWith('{')) {
    const data = JSON.parse(text) as {
      format?: string;
      name?: string;
      subject?: string;
      htmlBody?: string;
    };
    if (!data.htmlBody?.trim()) throw new Error('JSON file missing htmlBody');
    return {
      name: data.name?.trim() || file.name.replace(/\.json$/i, ''),
      subject: data.subject?.trim() || '',
      htmlBody: data.htmlBody,
    };
  }
  return {
    name: file.name.replace(/\.html?$/i, '') || 'Imported template',
    subject: '',
    htmlBody: text,
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const user = getStoredUser<SessionUser>();
  const admin = isTenantAdmin(user);
  const importRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [blocks, setBlocks] = useState<BlockTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingBlock, setCreatingBlock] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([api.listTemplates(token), api.listBlockTemplates(token)])
      .then(([t, b]) => {
        setTemplates(t.templates);
        setBlocks(b.blocks);
      })
      .finally(() => setLoading(false));
  }, []);

  async function useBlock(block: BlockTemplate) {
    const token = getToken();
    if (!token) return;
    setCreatingBlock(block.id);
    try {
      const res = await api.createTemplateFromBlock(token, { blockId: block.id, name: block.name });
      router.push(`/dashboard/templates/${res.template._id}`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to create template');
    } finally {
      setCreatingBlock(null);
    }
  }

  async function onImportFile(file: File) {
    const token = getToken();
    if (!token) return;
    setImporting(true);
    setImportError('');
    try {
      const parsed = await parseTemplateFile(file);
      const res = await api.importTemplate(token, parsed);
      router.push(`/dashboard/templates/${res.template._id}`);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  }

  return (
    <DashboardShell
      title="Templates"
      subtitle="HTML email templates with merge tag personalization"
      action={
        admin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={importing}
              onClick={() => importRef.current?.click()}
            >
              Import
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".json,.html,.htm,text/html,application/json"
              className="sr-only"
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportFile(file);
              }}
            />
            <ButtonLink href="/dashboard/templates/new">New template</ButtonLink>
          </div>
        ) : undefined
      }
    >
      {importError && <p className="mb-4 text-sm text-[var(--danger)]">{importError}</p>}

      <Card className="mb-6">
        <CardHeader title="Merge tags" subtitle="Safe defaults applied when a tag is missing" />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {MERGE_TAGS.map((tag) => (
              <code key={tag} className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs">{tag}</code>
            ))}
          </div>
        </CardBody>
      </Card>

      {blocks.length > 0 && admin && (
        <Card className="mb-6">
          <CardHeader title="Block library" subtitle="Start from a pre-built layout" />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {blocks.map((b) => (
                <div key={b.id} className="rounded-lg border border-border p-4">
                  <p className="font-medium">{b.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    loading={creatingBlock === b.id}
                    onClick={() => useBlock(b)}
                  >
                    Use template
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-48" />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          message="Create an HTML template. Marketing emails must include an unsubscribe link."
          action={
            admin ? (
              <ButtonLink href={`/dashboard/templates/new?html=${encodeURIComponent(STARTER_HTML)}`} variant="primary">
                Create from starter
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Link key={t._id} href={`/dashboard/templates/${t._id}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40">
              <Card className="h-full transition hover:border-[var(--primary)]/30 hover:shadow-md">
                <CardBody>
                  <p className="font-semibold">{t.name}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{t.subject || 'No subject'}</p>
                  <p className="mt-3 text-xs text-muted-foreground">v{t.version} · {new Date(t.updatedAt).toLocaleDateString()}</p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
