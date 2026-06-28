'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { PendingAttachmentList } from '@/components/inbox/PendingAttachmentList';
import { ListPickerDrawer } from '@/components/campaigns/ListPickerDrawer';
import { Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  pendingAttachmentFromFile,
  serializeAttachments,
  validateNewAttachments,
  type PendingAttachment,
} from '@/lib/attachments';
import type { CampaignPreflight, ContactList, Template } from '@/lib/types';

export default function NewCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [listId, setListId] = useState('');
  const [preflight, setPreflight] = useState<CampaignPreflight | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [listDrawerOpen, setListDrawerOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedList = lists.find((l) => l._id === listId) || null;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([api.listTemplates(token), api.listContactLists(token)]).then(([t, l]) => {
      setTemplates(t.templates);
      setLists(l.lists);
      if (t.templates[0]) {
        setTemplateId(t.templates[0]._id);
        setSubject(t.templates[0].subject || '');
      }
      if (l.lists[0]) setListId(l.lists[0]._id);
    });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token || !templateId || !listId) return;
    api.preflightCampaign(token, { templateId, listId }).then(setPreflight).catch(() => setPreflight(null));
  }, [templateId, listId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const serialized = attachments.length ? await serializeAttachments(attachments) : undefined;
      const res = await api.createCampaign(token, {
        name,
        subject,
        templateId,
        listId,
        attachments: serialized?.slice(0, 5),
      });
      router.push(`/dashboard/campaigns/${res.campaign._id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell title="New campaign" subtitle="Pick audience + template">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Campaign details" />
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <Select label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </Select>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">Contact list</label>
                <button
                  type="button"
                  onClick={() => setListDrawerOpen(true)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-left text-sm transition hover:border-[var(--primary)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                >
                  {selectedList ? (
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{selectedList.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(selectedList.contactCount ?? 0).toLocaleString()} contacts
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{lists.length ? 'Choose a list…' : 'No lists yet'}</span>
                  )}
                  <span className="shrink-0 text-xs font-medium text-[var(--primary)]">
                    {selectedList ? 'Change' : 'Browse'}
                  </span>
                </button>
                <p className="text-xs text-muted-foreground">Pick from a searchable panel — handy when you have lots of lists.</p>
              </div>
              <div className="rounded-lg border border-border">
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm text-muted-foreground">Optional attachments (max 5)</p>
                  <label className="cursor-pointer text-sm font-medium text-[var(--primary)]">
                    Add files
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        const err = validateNewAttachments(attachments, e.target.files || []);
                        if (err) {
                          setError(err);
                          return;
                        }
                        if (e.target.files?.length) {
                          setAttachments([
                            ...attachments,
                            ...Array.from(e.target.files).map(pendingAttachmentFromFile).slice(0, 5 - attachments.length),
                          ]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
                <PendingAttachmentList
                  items={attachments}
                  onRemove={(id) => setAttachments(attachments.filter((a) => a.id !== id))}
                />
              </div>
              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              <Button type="submit" loading={loading} disabled={!templates.length || !lists.length}>
                Create draft
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pre-flight checks" subtitle="Must pass before queueing send" />
          <CardBody>
            {preflight ? (
              <>
                <p className={`mb-3 text-sm font-medium ${preflight.ok ? 'text-[var(--accent)]' : 'text-[var(--warning)]'}`}>
                  {preflight.ok ? 'All checks passed' : 'Issues found'}
                </p>
                <ul className="space-y-2 text-sm">
                  {preflight.ok ? (
                    <li className="text-muted-foreground">
                      {preflight.recipientCount} subscribed recipients · {preflight.remaining ?? '∞'} quota remaining
                    </li>
                  ) : (
                    preflight.notes.map((n) => (
                      <li key={n} className="flex gap-2 text-[var(--warning)]">
                        <span aria-hidden>⚠</span> {n}
                      </li>
                    ))
                  )}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select template and list to run checks.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <ListPickerDrawer
        open={listDrawerOpen}
        lists={lists}
        selectedId={listId}
        onSelect={setListId}
        onClose={() => setListDrawerOpen(false)}
      />
    </DashboardShell>
  );
}
