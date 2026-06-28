'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Skeleton } from '@/components/ui';

/**
 * Confirms the signed-in user's email with a 6-digit OTP code sent to their inbox.
 */
function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justRegistered = params.get('check') === '1';
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  // Dev convenience: pick up the code stashed by the register page (no mail provider).
  const [devCode, setDevCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const stashed = sessionStorage.getItem('devVerifyCode');
    if (stashed) sessionStorage.removeItem('devVerifyCode');
    return stashed;
  });
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');
    const sessionToken = getToken();
    if (!sessionToken) {
      setMessage('Sign in first, then enter your verification code.');
      setStatus('error');
      return;
    }
    setLoading(true);
    try {
      const res = await api.verifyEmail(sessionToken, code.trim());
      setMessage(res.message || 'Email verified successfully.');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Verification failed');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    const sessionToken = getToken();
    if (!sessionToken) {
      setMessage('Sign in first, then resend the verification code.');
      setStatus('error');
      return;
    }
    setResendLoading(true);
    setMessage('');
    try {
      const res = await api.resendVerification(sessionToken);
      setMessage(res.message || 'Verification code sent. Check your inbox.');
      if (res.devVerifyCode) setDevCode(res.devVerifyCode);
      setStatus('idle');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not resend verification code');
      setStatus('error');
    } finally {
      setResendLoading(false);
    }
  }

  if (status === 'done') {
    return (
      <>
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
        <Button type="button" size="lg" className="mt-4 w-full" onClick={() => router.push('/dashboard')}>
          Go to dashboard
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {justRegistered
          ? 'We emailed a 6-digit code to your address. Enter it below to confirm your email.'
          : 'Enter the 6-digit code from your email, or request a new one below.'}
      </p>

      <Input
        name="code"
        label="Verification code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        placeholder="123456"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="tracking-[0.5em] text-center text-lg"
        required
      />

      {status === 'error' && message && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      )}
      {status !== 'error' && message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {devCode && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Dev code: <span className="font-mono font-semibold">{devCode}</span>
        </p>
      )}

      <Button type="submit" size="lg" loading={loading} className="w-full" disabled={code.length !== 6}>
        Verify email
      </Button>

      <Button type="button" variant="secondary" loading={resendLoading} onClick={onResend} className="w-full">
        Resend code
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell eyebrow="Account" heading="Verify your email" sub="Enter the 6-digit code we sent you.">
      <Suspense fallback={<Skeleton className="h-32" />}>
        <VerifyEmailForm />
      </Suspense>
    </AuthShell>
  );
}
