'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, CardBody } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

/**
 * Public unsubscribe confirmation UI (browser clicks from email footer).
 */
export function UnsubscribeContent() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const legacyEmail = params.get('email') || '';
  const legacyTenant = params.get('tenant') || params.get('tenantId') || '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [already, setAlready] = useState(false);
  const [resolvedEmail, setResolvedEmail] = useState(legacyEmail);

  const hasToken = Boolean(token);
  const hasLegacy = Boolean(legacyEmail && legacyTenant);

  useEffect(() => {
    if (!hasToken && !hasLegacy) return;

    const qs = hasToken
      ? `token=${encodeURIComponent(token)}`
      : `email=${encodeURIComponent(legacyEmail)}&tenant=${encodeURIComponent(legacyTenant)}`;

    fetch(`${API_URL}/public/unsubscribe/status?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setAlready(Boolean(d.suppressed));
        if (d.email) setResolvedEmail(d.email);
      })
      .catch(() => {});
  }, [hasToken, hasLegacy, token, legacyEmail, legacyTenant]);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (!hasToken && !hasLegacy) {
      setMessage('Invalid unsubscribe link.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    try {
      const body = hasToken
        ? { token }
        : { email: legacyEmail, tenantId: legacyTenant };

      const res = await fetch(`${API_URL}/public/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unsubscribe failed');
      if (data.email) setResolvedEmail(data.email);
      setMessage(data.message || 'You have been unsubscribed.');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  if (!hasToken && !hasLegacy) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardBody>
            <h1 className="text-lg font-semibold">Invalid link</h1>
            <p className="mt-2 text-sm text-muted-foreground">This unsubscribe link is missing required parameters.</p>
          </CardBody>
        </Card>
      </main>
    );
  }

  const displayEmail = resolvedEmail || legacyEmail || 'your address';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardBody>
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white text-sm" aria-hidden>✉</span>
            <span className="font-bold">Mail Box</span>
          </div>

          {status === 'done' || already ? (
            <>
              <h1 className="text-lg font-semibold">Unsubscribed</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {message || `${displayEmail} will no longer receive marketing email from this sender.`}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Unsubscribe</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Confirm you want to unsubscribe <strong className="text-foreground">{displayEmail}</strong> from future marketing emails.
              </p>
              <form onSubmit={onConfirm} className="mt-6">
                <Button type="submit" loading={status === 'loading'} className="w-full">
                  Confirm unsubscribe
                </Button>
              </form>
              {status === 'error' && <p className="mt-3 text-sm text-[var(--danger)]">{message}</p>}
            </>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href="/" className="underline underline-offset-2">Mail Box</Link>
          </p>
        </CardBody>
      </Card>
    </main>
  );
}
