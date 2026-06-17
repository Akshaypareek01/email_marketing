'use client';

import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { SystemNoticesBanner } from './dashboard/SystemNoticesBanner';
import { ImpersonationBanner } from './dashboard/ImpersonationBanner';
import { isImpersonating } from '@/lib/auth';

interface DashboardShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Inbox uses its own full-width layout without the default header padding. */
  fullBleed?: boolean;
}

/**
 * Tenant app layout shell — sidebar + page header per DESIGN.md §9.
 */
export function DashboardShell({
  children,
  title,
  subtitle,
  action,
  fullBleed = false,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {!fullBleed && (
          <header className="flex items-start justify-between gap-4 border-b border-border bg-card px-8 py-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {action}
          </header>
        )}
        <div className={fullBleed ? 'flex min-h-0 flex-1 flex-col' : 'p-8'}>
          {!fullBleed && isImpersonating() && <ImpersonationBanner />}
          {!fullBleed && <SystemNoticesBanner />}
          {children}
        </div>
      </main>
    </div>
  );
}
