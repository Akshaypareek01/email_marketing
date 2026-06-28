'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { setSession } from '@/lib/auth';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/countryCodes';
import { AuthShell } from '@/components/AuthShell';
import { Button, Input, Select } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);

    const password = String(form.get('password'));
    const confirmPassword = String(form.get('confirmPassword'));
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const phone = String(form.get('phone')).replace(/[^\d]/g, '');
    if (phone.length < 6) {
      setError('Enter a valid mobile number.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.register({
        name: String(form.get('name')),
        email: String(form.get('email')),
        password,
        tenantName: String(form.get('tenantName')),
        phoneCountryCode: countryCode,
        phone,
      });
      setSession(data.token, data.user, data.refreshToken);
      if (!data.user.emailVerified) {
        // Dev convenience: when no mail provider is configured, surface the code on the next page.
        if (data.devVerifyCode) sessionStorage.setItem('devVerifyCode', data.devVerifyCode);
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
        <Input name="email" type="email" label="Email" placeholder="you@example.com" required autoComplete="email" hint="Personal or work email — both work." />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-foreground">Mobile number</label>
          <div className="flex gap-2">
            <Select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="w-40 shrink-0"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Input
              name="phone"
              type="tel"
              inputMode="numeric"
              placeholder="9876543210"
              required
              autoComplete="tel-national"
              className="flex-1"
            />
          </div>
        </div>

        <Input name="password" type="password" label="Password" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" hint="Use 8+ characters with a mix of letters and numbers." />
        <Input name="confirmPassword" type="password" label="Confirm password" placeholder="Re-enter your password" required minLength={8} autoComplete="new-password" />

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
