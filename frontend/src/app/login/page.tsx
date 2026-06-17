'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import type { AuthResponse } from '@/lib/types';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const data = (await api.login({
        email: String(form.get('email')),
        password: String(form.get('password')),
      })) as AuthResponse;
      setSession(data.token, data.user, data.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow="Welcome back" heading="Sign in to Mail Box" sub="Access your campaigns, domains and analytics.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input name="email" type="email" label="Email" placeholder="you@company.com" required autoComplete="email" />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
            <Link href="/forgot-password" className="text-xs text-[var(--primary)] hover:underline">Forgot?</Link>
          </div>
          <Input name="password" id="password" type="password" placeholder="••••••••" required minLength={8} autoComplete="current-password" />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/register" className="font-semibold text-[var(--primary)] hover:underline">Create one</Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Platform operator?{' '}
        <Link href="/admin/login" className="font-medium text-foreground hover:underline">Admin sign in</Link>
      </p>
    </AuthShell>
  );
}
