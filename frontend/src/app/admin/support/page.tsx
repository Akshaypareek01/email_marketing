'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { SupportAttachmentPicker } from '@/components/support/SupportAttachmentPicker';
import { TicketAttachmentList } from '@/components/support/TicketAttachmentList';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Skeleton,
  Textarea,
  statusTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth';
import { serializeAttachments, type PendingAttachment } from '@/lib/supportAttachments';
import type { CannedResponse, SessionUser, SupportTicket, TicketStatus } from '@/lib/types';

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [assignToMe, setAssignToMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const me = getStoredUser<SessionUser>();

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const [ticketRes, cannedRes] = await Promise.all([
        api.adminListSupportTickets(token, { status: statusFilter || undefined }),
        api.adminListCannedResponses(token),
      ]);
      setTickets(ticketRes.tickets);
      setCanned(cannedRes.responses);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = tickets.find((t) => t._id === selectedId) || null;

  useEffect(() => {
    if (!selected || !me?.id) {
      setAssignToMe(false);
      return;
    }
    setAssignToMe(String(selected.assigneeId || '') === me.id);
  }, [selected, me?.id]);

  async function onReply(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !selectedId || !reply.trim()) return;
    try {
      const attachments = replyAttachments.length
        ? await serializeAttachments(replyAttachments)
        : undefined;
      await api.adminReplySupportTicket(token, selectedId, { message: reply.trim(), attachments });
      setReply('');
      setReplyAttachments([]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reply failed');
    }
  }

  async function onStatusChange(status: TicketStatus) {
    const token = getToken();
    if (!token || !selectedId) return;
    await api.adminSetTicketStatus(token, selectedId, status);
    await load();
  }

  async function onAssignChange(checked: boolean) {
    const token = getToken();
    if (!token || !selectedId || !me?.id) return;
    await api.adminAssignTicket(token, selectedId, checked ? me.id : null);
    setAssignToMe(checked);
    await load();
  }

  function insertCanned(id: string) {
    const item = canned.find((c) => c.id === id);
    if (item) setReply((prev) => (prev ? `${prev}\n\n${item.body}` : item.body));
  }

  return (
    <AdminShell title="Support queue">
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mb-4">
        <Select
          label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="max-w-xs"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={`Tickets (${tickets.length})`} />
          <CardBody className="p-0">
            {loading ? (
              <Skeleton className="m-4 h-32" />
            ) : tickets.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tickets.</p>
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
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.tenant?.name || 'Unknown tenant'}
                      </p>
                      <Badge tone={statusTone(t.status)} className="mt-2">{t.status}</Badge>
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
              <CardHeader
                title={selected.subject}
                subtitle={selected.tenant?.name}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={assignToMe}
                        onChange={(e) => onAssignChange(e.target.checked)}
                        aria-label="Assign ticket to me"
                      />
                      Assigned to me
                    </label>
                    <Select
                      value={selected.status}
                      onChange={(e) => onStatusChange(e.target.value as TicketStatus)}
                      aria-label="Ticket status"
                    >
                      {(['open', 'in_progress', 'resolved', 'closed'] as TicketStatus[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                  </div>
                }
              />
              <CardBody>
                <ul className="mb-6 space-y-4">
                  {selected.messages.map((m) => (
                    <li
                      key={m._id}
                      className={`rounded-lg p-4 ${m.authorRole === 'admin' ? 'bg-indigo-50' : 'bg-muted/50'}`}
                    >
                      <p className="mb-1 text-xs text-muted-foreground capitalize">
                        {m.authorRole} · {new Date(m.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <TicketAttachmentList attachments={m.attachments} />
                    </li>
                  ))}
                </ul>
                {selected.status !== 'closed' && (
                  <form onSubmit={onReply} className="space-y-3">
                    {canned.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {canned.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => insertCanned(c.id)}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <Textarea label="Admin reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={4} required />
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
              <EmptyState title="Select a ticket" message="Pick a ticket from the queue to view and reply." />
            </CardBody>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
