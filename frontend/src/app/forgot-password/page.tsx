'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

type Step = 'request' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevCode('');
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
      if (res.devResetCode) setDevCode(res.devResetCode);
      setStep('reset');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function onReset(e: FormEvent) {
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
      setStep('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      heading="Reset your password"
      sub={
        step === 'request'
          ? "We'll email a 6-digit code if this email is registered."
          : step === 'reset'
            ? 'Enter the code we emailed and choose a new password.'
            : 'Your password has been updated.'
      }
    >
      {step === 'request' && (
        <form onSubmit={onRequest} className="space-y-4">
          <Input
            type="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Send reset code
          </Button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={onReset} className="space-y-4">
          {message && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
          )}
          {devCode && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Dev code: <span className="font-mono font-semibold">{devCode}</span>
            </p>
          )}
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
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" loading={loading} className="w-full" disabled={code.length !== 6}>
            Update password
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('request');
              setCode('');
              setError('');
            }}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Use a different email
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center rounded-lg bg-[var(--primary)] text-sm font-semibold text-white hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
