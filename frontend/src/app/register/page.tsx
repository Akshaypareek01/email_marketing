'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import type { AuthResponse } from '@/lib/types';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const data = (await api.register({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password: String(form.get('password')),
        tenantName: String(form.get('tenantName')),
      })) as AuthResponse;
      setSession(data.token, data.user, data.refreshToken);
      if (!data.user.emailVerified) {
        router.push('/verify-email?check=1');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell eyebrow="Get started" heading="Create your account" sub="Set up your organization and start sending in minutes.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="name" label="Your name" placeholder="Akshay" required autoComplete="name" />
          <Input name="tenantName" label="Organization" placeholder="Acme Inc." required />
        </div>
        <Input name="email" type="email" label="Work email" placeholder="you@company.com" required autoComplete="email" />
        <Input name="password" type="password" label="Password" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" hint="Use 8+ characters with a mix of letters and numbers." />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By creating an account you agree to our Terms and acceptable-use policy.
        </p>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[var(--primary)] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
