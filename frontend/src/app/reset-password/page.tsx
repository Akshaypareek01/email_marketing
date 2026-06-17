'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Skeleton } from '@/components/ui';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
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
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Invalid reset link');
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetPassword(token, password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-[var(--danger)]">This reset link is invalid or missing a token.</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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

      <Button type="submit" size="lg" loading={loading} className="w-full" disabled={!!message}>
        Update password
      </Button>

      {message && (
        <p className="text-center text-sm">
          <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Sign in</Link>
        </p>
      )}
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account recovery" heading="Choose a new password" sub="Must be at least 8 characters.">
      <Suspense fallback={<Skeleton className="h-40" />}>
        <ResetPasswordForm />
      </Suspense>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
