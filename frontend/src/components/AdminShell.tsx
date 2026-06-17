'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { clearSession, getStoredUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/types';

const NAV = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/insights', label: 'Insights' },
  { href: '/admin/tenants', label: 'Tenants' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/transactions', label: 'Transactions' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/reputation', label: 'SES Health' },
  { href: '/admin/suppressions', label: 'Suppressions' },
  { href: '/admin/support', label: 'Support' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    Overview: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    Insights: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    Tenants: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
    Plans: <><path d="M3 9h18" /><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 15h4" /></>,
    Transactions: <><path d="M3 3v18h18" /><path d="M7 16V8" /><path d="M12 16V5" /><path d="M17 16v-6" /></>,
    Audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
    'SES Health': <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    Suppressions: <><path d="M18 6 6 18M6 6l12 12" /></>,
    Support: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function AdminShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser<SessionUser>();

  function logout() {
    clearSession();
    router.push('/admin/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar — dark, distinct from tenant app */}
      <aside className="flex w-64 flex-col bg-slate-950 text-slate-300">
        <div className="flex items-center gap-2 border-b border-white/10 px-6 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          </span>
          <div>
            <p className="text-sm font-bold text-white">Mail Box</p>
            <p className="text-[11px] text-emerald-400">Admin Console</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {NAV.map((l) => {
            const active = l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon name={l.label} className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 px-1">
            <p className="truncate text-sm font-medium text-white">{user?.name || 'Admin'}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button onClick={logout} className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <header className="flex items-center justify-between border-b border-border bg-white px-8 py-5">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {action}
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
