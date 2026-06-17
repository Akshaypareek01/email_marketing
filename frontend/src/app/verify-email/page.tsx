'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { Button, Skeleton } from '@/components/ui';

type VerifyStatus = 'idle' | 'loading' | 'done' | 'error';

/**
 * Verifies email from `?token=` (auto on load) or lets the user resend the link.
 */
function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const justRegistered = params.get('check') === '1';
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [message, setMessage] = useState('');
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  const runVerify = useCallback(async (verifyToken: string) => {
    setStatus('loading');
    setMessage('');
    try {
      const res = await api.verifyEmail(verifyToken);
      setMessage(res.message || 'Email verified successfully.');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Verification failed');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (token) {
      runVerify(token);
    }
  }, [token, runVerify]);

  async function onResend() {
    const sessionToken = getToken();
    if (!sessionToken) {
      setMessage('Sign in first, then resend the verification email.');
      setStatus('error');
      return;
    }

    setResendLoading(true);
    setMessage('');
    try {
      const res = await api.resendVerification(sessionToken);
      setMessage(res.message || 'Verification link sent. Check your inbox.');
      if (res.devVerifyUrl) setDevVerifyUrl(res.devVerifyUrl);
      setStatus('idle');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not resend verification email');
      setStatus('error');
    } finally {
      setResendLoading(false);
    }
  }

  if (token) {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="space-y-3" aria-live="polite">
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }

    if (status === 'done') {
      return (
        <>
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
          <p className="mt-4 text-center text-sm">
            <Link href="/dashboard" className="font-semibold text-[var(--primary)] hover:underline">
              Go to dashboard
            </Link>
          </p>
        </>
      );
    }

    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        <Button type="button" variant="secondary" loading={resendLoading} onClick={onResend} className="w-full">
          Resend verification email
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {justRegistered
          ? 'We sent a verification link to your email. Open it to confirm your address.'
          : 'Open the verification link from your email, or request a new one below.'}
      </p>

      {status === 'error' && message && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}

      {message && status !== 'error' && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      {devVerifyUrl && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 break-all">
          Dev link:{' '}
          <Link href={devVerifyUrl} className="font-semibold underline">
            {devVerifyUrl}
          </Link>
        </p>
      )}

      <Button type="button" size="lg" loading={resendLoading} onClick={onResend} className="w-full">
        Resend verification email
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell eyebrow="Account" heading="Verify your email" sub="One click to confirm your address.">
      <Suspense fallback={<Skeleton className="h-32" />}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
