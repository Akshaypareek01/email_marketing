'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { SupportAttachmentPicker } from '@/components/support/SupportAttachmentPicker';
import { TicketAttachmentList } from '@/components/support/TicketAttachmentList';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Skeleton,
  Textarea,
  statusTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { serializeAttachments, type PendingAttachment } from '@/lib/supportAttachments';
import type { SupportTicket } from '@/lib/types';

export default function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [createAttachments, setCreateAttachments] = useState<PendingAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listSupportTickets(token);
      setTickets(res.tickets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = tickets.find((t) => t._id === selectedId) || null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    try {
      const attachments = createAttachments.length
        ? await serializeAttachments(createAttachments)
        : undefined;
      const res = await api.createSupportTicket(token, { subject, message, attachments });
      setSubject('');
      setMessage('');
      setCreateAttachments([]);
      setShowForm(false);
      setSelectedId(res.ticket._id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create ticket');
    }
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !reply.trim()) return;
    const token = getToken();
    if (!token) return;
    try {
      const attachments = replyAttachments.length
        ? await serializeAttachments(replyAttachments)
        : undefined;
      await api.replySupportTicket(token, selectedId, { message: reply.trim(), attachments });
      setReply('');
      setReplyAttachments([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reply failed');
    }
  }

  return (
    <DashboardShell
      title="Support"
      subtitle="Get help from the Mail Box team"
      action={
        <Button onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? 'Cancel' : 'New ticket'}
        </Button>
      }
    >
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader title="Create ticket" />
          <CardBody>
            <form onSubmit={onCreate} className="space-y-4">
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
              <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} required />
              <SupportAttachmentPicker
                items={createAttachments}
                onChange={setCreateAttachments}
                onError={setError}
              />
              <Button type="submit">Submit ticket</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Tickets" />
          <CardBody className="p-0">
            {loading ? (
              <Skeleton className="m-4 h-32" />
            ) : tickets.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tickets.map((t) => (
                  <li key={t._id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t._id)}
                      className={`w-full px-4 py-3 text-left transition hover:bg-muted/50 ${selectedId === t._id ? 'bg-[var(--primary)]/5' : ''}`}
                    >
                      <p className="truncate text-sm font-medium">{t.subject}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          {selected ? (
            <>
              <CardHeader title={selected.subject} action={<Badge tone={statusTone(selected.status)}>{selected.status}</Badge>} />
              <CardBody>
                <ul className="mb-6 space-y-4">
                  {selected.messages.map((m) => (
                    <li key={m._id} className="rounded-lg bg-muted/50 p-4">
                      <p className="mb-1 text-xs text-muted-foreground capitalize">{m.authorRole} · {new Date(m.createdAt).toLocaleString()}</p>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <TicketAttachmentList attachments={m.attachments} />
                    </li>
                  ))}
                </ul>
                {selected.status !== 'closed' && (
                  <form onSubmit={onReply} className="space-y-3">
                    <Textarea label="Reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} required />
                    <SupportAttachmentPicker
                      items={replyAttachments}
                      onChange={setReplyAttachments}
                      onError={setError}
                    />
                    <Button type="submit" size="sm">Send reply</Button>
                  </form>
                )}
              </CardBody>
            </>
          ) : (
            <CardBody>
              <EmptyState
                title="Select a ticket"
                message="Choose a ticket from the list or create a new one."
                action={!tickets.length ? <Button onClick={() => setShowForm(true)}>Create ticket</Button> : undefined}
              />
            </CardBody>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
