'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardShell } from '@/components/DashboardShell';
import { Button, Card, CardBody, Input, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Mailbox } from '@/lib/types';

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

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    const token = getToken();
    if (!token) return;

    try {
      const res = (await api.sendEmail(token, {
        mailboxId,
        to,
        subject,
        html: body,
        threadId,
      })) as { messageId?: string; threadId?: string };
      setMessage(
        `Sent successfully${res.messageId ? ` · SES id: ${res.messageId}` : ''}${res.threadId ? ` · Thread: ${res.threadId}` : ''}`
      );
      if (!threadId) {
        setTo('');
        setSubject('');
        setBody('');
      }
      setThreadId(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Send failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell title="Send email" subtitle="Single outbound message via AWS SES">
      {threadId && (
        <div className="mb-4 rounded-lg border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2 text-sm">
          Replying in thread <code className="text-xs">{threadId}</code>
        </div>
      )}

      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={onSend} className="space-y-4">
            <Select
              label="From mailbox"
              value={mailboxId}
              onChange={(e) => setMailboxId(e.target.value)}
              required
            >
              {mailboxes.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.address}
                </option>
              ))}
            </Select>
            <Input label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            <Textarea
              label="Body (HTML)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {message && <p className="text-sm text-[var(--accent)]">{message}</p>}
            <Button type="submit" loading={loading} disabled={!mailboxes.length}>
              Send via SES
            </Button>
          </form>
        </CardBody>
      </Card>
    </DashboardShell>
  );
}
