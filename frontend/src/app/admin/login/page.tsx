'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { setSession, clearSession } from '@/lib/auth';
import type { AuthResponse } from '@/lib/types';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

export default function AdminLoginPage() {
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

      if (data.user.role !== 'super_admin') {
        clearSession();
        setError('This account does not have admin access.');
        return;
      }
      setSession(data.token, data.user, data.refreshToken);
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell variant="admin" eyebrow="Admin console" heading="Operator sign in" sub="Restricted to platform super-admins.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input name="email" type="email" label="Admin email" placeholder="admin@mailbox.io" required autoComplete="email" />
        <Input name="password" type="password" label="Password" placeholder="••••••••" required minLength={8} autoComplete="current-password" />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? 'Signing in…' : 'Sign in to console'}
        </Button>
      </form>
    </AuthShell>
  );
}
