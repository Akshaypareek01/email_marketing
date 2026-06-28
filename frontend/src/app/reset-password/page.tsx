'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Skeleton } from '@/components/ui';

/**
 * Standalone password reset using an emailed OTP code (email + code + new password).
 * Request a code from the "Forgot password" page first.
 */
function ResetPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetPassword(email, code.trim(), password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        type="email"
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
      />
      <Input
        label="Reset code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        placeholder="123456"
        inputMode="numeric"
        autoComplete="one-time-code"
        className="tracking-[0.5em] text-center text-lg"
        required
      />
      <Input
        type="password"
        label="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
        autoComplete="new-password"
      />
      <Input
        type="password"
        label="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        minLength={8}
        required
        autoComplete="new-password"
      />

      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <Button type="submit" size="lg" loading={loading} className="w-full" disabled={!!message || code.length !== 6}>
        Update password
      </Button>

      {message ? (
        <p className="text-center text-sm">
          <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Sign in</Link>
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Need a code?{' '}
          <Link href="/forgot-password" className="font-semibold text-[var(--primary)] hover:underline">
            Request one
          </Link>
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account recovery" heading="Choose a new password" sub="Enter the code we emailed and a new password.">
      <Suspense fallback={<Skeleton className="h-40" />}>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
