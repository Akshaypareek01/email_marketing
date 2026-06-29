'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PendingAttachmentList } from '@/components/inbox/PendingAttachmentList';
import { ListPickerDrawer } from '@/components/campaigns/ListPickerDrawer';
import { Button, Card, CardBody, CardHeader, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  pendingAttachmentFromFile,
  serializeAttachments,
  validateNewAttachments,
  type PendingAttachment,
} from '@/lib/attachments';
import type { ContactList, Template } from '@/lib/types';

export interface CampaignComposeValues {
  name: string;
  subject: string;
  templateId: string;
  listId: string;
}

interface CampaignComposeFormProps {
  initial?: Partial<CampaignComposeValues>;
  submitLabel: string;
  loading?: boolean;
  error?: string;
  onErrorClear?: () => void;
  onValidationError?: (message: string) => void;
  /** Fired when template or list changes so parent can refresh pre-flight. */
  onValuesChange?: (values: CampaignComposeValues) => void;
  onSubmit: (values: CampaignComposeValues, attachments?: Awaited<ReturnType<typeof serializeAttachments>>) => Promise<void>;
}

/**
 * Shared compose form for new and draft campaign editing.
 */
export function CampaignComposeForm({
  initial,
  submitLabel,
  loading = false,
  error,
  onErrorClear,
  onValidationError,
  onValuesChange,
  onSubmit,
}: CampaignComposeFormProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [name, setName] = useState(initial?.name || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [templateId, setTemplateId] = useState(initial?.templateId || '');
  const [listId, setListId] = useState(initial?.listId || '');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [listDrawerOpen, setListDrawerOpen] = useState(false);

  const selectedList = lists.find((l) => l._id === listId) || null;

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([api.listTemplates(token), api.listContactLists(token)]).then(([t, l]) => {
      setTemplates(t.templates);
      setLists(l.lists);
      if (!initial?.templateId && t.templates[0]) {
        setTemplateId(t.templates[0]._id);
        if (!initial?.subject) setSubject(t.templates[0].subject || '');
      }
      if (!initial?.listId && l.lists[0]) setListId(l.lists[0]._id);
    });
  }, [initial?.listId, initial?.subject, initial?.templateId]);

  useEffect(() => {
    if (!templateId || !listId) return;
    onValuesChange?.({ name, subject, templateId, listId });
  }, [templateId, listId, onValuesChange]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onErrorClear?.();
    const serialized = attachments.length ? await serializeAttachments(attachments) : undefined;
    await onSubmit({ name, subject, templateId, listId }, serialized?.slice(0, 5));
  }

  return (
    <>
      <Card>
        <CardHeader title="Campaign details" subtitle="Step 1 — compose your send" />
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            <Select
              label="Template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const tpl = templates.find((t) => t._id === e.target.value);
                if (tpl?.subject) setSubject(tpl.subject);
              }}
              required
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
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
                        onValidationError?.(err);
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
              {submitLabel}
            </Button>
          </form>
        </CardBody>
      </Card>

      <ListPickerDrawer
        open={listDrawerOpen}
        lists={lists}
        selectedId={listId}
        onSelect={setListId}
        onClose={() => setListDrawerOpen(false)}
      />
    </>
  );
}
