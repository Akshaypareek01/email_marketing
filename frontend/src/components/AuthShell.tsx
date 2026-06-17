'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

/**
 * Two-pane auth layout: brand panel + form card.
 * `accent` switches the brand panel for the super-admin login.
 */
export function AuthShell({
  children,
  eyebrow,
  heading,
  sub,
  variant = 'app',
}: {
  children: ReactNode;
  eyebrow: string;
  heading: string;
  sub: string;
  variant?: 'app' | 'admin';
}) {
  const isAdmin = variant === 'admin';
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div
        className={`relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between ${
          isAdmin ? 'bg-slate-950' : 'bg-[var(--primary)]'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -left-16 top-10 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
          <div className="absolute -right-10 bottom-10 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
        </div>

        <Link href="/" className="relative flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          </span>
          <span className="text-lg font-bold tracking-tight">Mail Box{isAdmin && <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-medium">Admin</span>}</span>
        </Link>

        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">
            {isAdmin ? 'Operate the platform with confidence.' : 'Send email that actually lands.'}
          </h2>
          <p className={`mt-4 max-w-sm ${isAdmin ? 'text-slate-300' : 'text-indigo-100'}`}>
            {isAdmin
              ? 'Monitor SES health, manage tenants, plans and billing — all in one control center.'
              : 'Connect your domain, run campaigns and protect your sender reputation automatically.'}
          </p>
        </div>

        <p className={`relative text-xs ${isAdmin ? 'text-slate-400' : 'text-indigo-200'}`}>
          © {new Date().getFullYear()} Mail Box
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
              </span>
              <span className="text-lg font-bold">Mail Box</span>
            </Link>
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--primary)]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>

          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
