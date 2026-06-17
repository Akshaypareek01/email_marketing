'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { cn } from '@/components/ui';

interface QuotaBarProps {
  used: number;
  total: number;
  remaining: number | null;
  usedPct: number;
  planName?: string | null;
}

/**
 * Signature quota progress bar — amber below 20%, red at 0%.
 */
export function QuotaBar({ used, total, remaining, usedPct, planName }: QuotaBarProps) {
  const pct = total > 0 ? usedPct : 0;
  const barTone =
    remaining === 0 ? 'bg-[var(--danger)]' : pct >= 80 ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]';

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Email quota</p>
          <p className="text-xs text-muted-foreground">
            {planName ? `${planName} plan · ` : ''}
            {total > 0 ? `${used.toLocaleString()} of ${total.toLocaleString()} sent` : 'No plan assigned'}
          </p>
        </div>
        {total > 0 && remaining != null && (
          <p className="text-sm font-semibold tabular-nums">
            {remaining.toLocaleString()} remaining
          </p>
        )}
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Email quota usage"
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', barTone)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {remaining === 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--danger)]">Quota exhausted — upgrade to send more.</p>
          <ButtonLink href="/dashboard/billing" variant="primary" size="sm">
            Upgrade plan
          </ButtonLink>
        </div>
      )}
      {remaining != null && remaining > 0 && pct >= 80 && (
        <p className="mt-2 text-xs text-[var(--warning)]">
          Running low —{' '}
          <Link href="/dashboard/billing" className="font-medium underline underline-offset-2">
            upgrade your plan
          </Link>
        </p>
      )}
    </div>
  );
}
