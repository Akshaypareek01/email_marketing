'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { clearSession, getStoredUser } from '@/lib/auth';
import { isTenantAdmin } from '@/lib/roles';
import type { SessionUser } from '@/lib/types';

type NavLink = { href: string; label: string; exact?: boolean; adminOnly?: boolean };

const NAV_GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: 'Overview',
    links: [{ href: '/dashboard', label: 'Dashboard', exact: true }],
  },
  {
    title: 'Marketing',
    links: [
      { href: '/dashboard/contacts', label: 'Contacts' },
      { href: '/dashboard/templates', label: 'Templates' },
      { href: '/dashboard/campaigns', label: 'Bulk send' },
      { href: '/dashboard/analytics', label: 'Analytics' },
    ],
  },
  {
    title: 'Sending',
    links: [
      { href: '/dashboard/domains', label: 'Domains' },
      { href: '/dashboard/mailboxes', label: 'Mailboxes' },
      { href: '/dashboard/compose', label: 'Send email' },
      { href: '/dashboard/events', label: 'Events', adminOnly: true },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/dashboard/billing', label: 'Billing', adminOnly: true },
      { href: '/dashboard/transactions', label: 'Transactions', adminOnly: true },
      { href: '/dashboard/team', label: 'Team', adminOnly: true },
      { href: '/dashboard/profile', label: 'Profile' },
      { href: '/dashboard/support', label: 'Support' },
    ],
  },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    Dashboard: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>,
    Contacts: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    Templates: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    Campaigns: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    'Bulk send': <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    Analytics: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></>,
    Domains: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" /></>,
    Mailboxes: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
    Mail: <><path d="M22 6v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6" /><path d="m2 6 10 7 10-7" /></>,
    'Send email': <><path d="M12 19V5M5 12l7-7 7 7" /></>,
    Events: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    Billing: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    Transactions: <><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 5-5" /><path d="M17 9h2v2" /></>,
    Team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    Profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
    Support: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

/**
 * Tenant dashboard sidebar with grouped navigation.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser<SessionUser>();
  const admin = isTenantAdmin(user);

  function logout() {
    clearSession();
    router.push('/login');
  }

  function isActive(link: NavLink) {
    return link.exact
      ? pathname === link.href
      : pathname === link.href || pathname.startsWith(`${link.href}/`);
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-6 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Mail Box" className="h-8 w-8 rounded-[20px] object-cover" />
        <div>
          <p className="text-sm font-bold tracking-tight">Mail Box</p>
          <p className="text-[11px] text-muted-foreground">Email platform</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.links
                .filter((link) => !link.adminOnly || admin)
                .map((link) => {
                const active = isActive(link);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon name={link.label} className="h-4 w-4 shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="mb-3 px-1">
          <p className="truncate text-sm font-medium">{user?.name || 'Account'}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          {user?.role && (
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{user.role}</p>
          )}
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
