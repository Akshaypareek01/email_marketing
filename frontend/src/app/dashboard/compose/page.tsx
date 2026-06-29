'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Skeleton, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { EmailThread, Mailbox } from '@/lib/types';

export default function ComposePage() {
  const searchParams = useSearchParams();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [sent, setSent] = useState<EmailThread[]>([]);
  const [sentLoading, setSentLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.listMailboxes(token).then((m) => {
      const list = m.mailboxes as Mailbox[];
      setMailboxes(list);
      if (list.length) setMailboxId(list[0]._id);
    });
  }, []);

  useEffect(() => {
    setThreadId(searchParams.get('threadId') || undefined);
    const toParam = searchParams.get('to');
    const subjParam = searchParams.get('subject');
    if (toParam) setTo(toParam);
    if (subjParam) setSubject(subjParam);
  }, [searchParams]);

  /** Load the most recent outbound conversations for the selected mailbox. */
  const loadSent = useCallback(async () => {
    const token = getToken();
    if (!token || !mailboxId) {
      setSent([]);
      return;
    }
    setSentLoading(true);
    try {
      const res = await api.listThreads(token, mailboxId, 'sent');
      setSent(res.threads as EmailThread[]);
    } catch {
      setSent([]);
    } finally {
      setSentLoading(false);
    }
  }, [mailboxId]);

  useEffect(() => {
    loadSent();
  }, [loadSent]);

  function startReply(thread: EmailThread) {
    setThreadId(thread._id);
    setTo(thread.counterpartyEmail || '');
    setSubject(thread.subject?.startsWith('Re:') ? thread.subject : `Re: ${thread.subject}`);
    setMessage('');
    setError('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearReply() {
    setThreadId(undefined);
    setSubject('');
    setTo('');
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = (await api.sendEmail(token, {
        mailboxId,
        to,
        subject,
        html: body,
        threadId,
      })) as { messageId?: string; threadId?: string };
      setMessage('Your email is on its way 🎉');
      if (!threadId) {
        setTo('');
        setSubject('');
      }
      setBody('');
      setThreadId(undefined);
      void res;
      await loadSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell title="Send email" subtitle="One recipient — use Bulk send for your full client list">
      <div className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Need to email your whole customer list at once?</span>{' '}
        <Link href="/dashboard/campaigns" className="font-semibold text-[var(--primary)] underline underline-offset-2">
          Bulk send to list
        </Link>
        <span className="text-muted-foreground"> — pick a template + contact list and send instantly.</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Composer */}
        <div className="lg:col-span-3">
          {threadId && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2 text-sm">
              <span>Replying to an earlier conversation</span>
              <button type="button" onClick={clearReply} className="font-medium text-[var(--primary)] hover:underline">
                Start a new email
              </button>
            </div>
          )}

          <Card>
            <CardBody>
              {mailboxes.length === 0 ? (
                <EmptyState
                  title="No sending address yet"
                  message="Add a mailbox under Sending → Mailboxes before you can send."
                />
              ) : (
                <form onSubmit={onSend} className="space-y-4">
                  <Select
                    label="From"
                    value={mailboxId}
                    onChange={(e) => setMailboxId(e.target.value)}
                    required
                  >
                    {mailboxes.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.displayName ? `${m.displayName} · ${m.address}` : m.address}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="To"
                    type="email"
                    placeholder="customer@example.com"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                  />
                  <Input
                    label="Subject"
                    placeholder="What’s this email about?"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                  <Textarea
                    label="Message"
                    placeholder="Write your message…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={9}
                    hint="Plain text works great. Basic HTML is supported if you need it."
                  />
                  {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
                  {message && <p className="text-sm font-medium text-[var(--accent)]">{message}</p>}
                  <Button type="submit" loading={loading}>
                    {threadId ? 'Send reply' : 'Send email'}
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Recently sent */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Recently sent" subtitle="Your latest outgoing emails" />
            <CardBody className="p-0">
              {sentLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : sent.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Nothing sent yet. Your sent emails will show up here.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {sent.map((t) => (
                    <li key={t._id} className="px-4 py-3 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.subject || '(no subject)'}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            To {t.counterpartyEmail || 'unknown'}
                            {t.messageCount > 1 ? ` · ${t.messageCount} messages` : ''}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {new Date(t.lastActivityAt).toLocaleString()}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => startReply(t)}>
                          Reply
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
