'use client';

import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui';
import type { CampaignPreflight } from '@/lib/types';

interface PreflightPanelProps {
  preflight: CampaignPreflight | null;
  waiting?: boolean;
}

/**
 * Explains pre-flight blockers vs warnings and what the user should do next.
 */
export function PreflightPanel({ preflight, waiting }: PreflightPanelProps) {
  return (
    <Card>
      <CardHeader title="Pre-flight checks" subtitle="Step 2 — review before sending" />
      <CardBody>
        {waiting || !preflight ? (
          <p className="text-sm text-muted-foreground">
            Select a template and contact list to run checks. You can still save a draft anytime.
          </p>
        ) : (
          <>
            <p
              className={`mb-3 text-sm font-medium ${
                preflight.ok
                  ? 'text-emerald-700'
                  : preflight.blockers?.length
                    ? 'text-[var(--danger)]'
                    : 'text-[var(--warning)]'
              }`}
            >
              {preflight.ok
                ? 'Ready to send'
                : preflight.blockers?.length
                  ? 'Fix these before sending'
                  : 'Review warnings'}
            </p>

            {preflight.ok && (
              <p className="mb-4 text-sm text-muted-foreground">
                {preflight.recipientCount} subscribed recipients · {preflight.remaining ?? '∞'} quota remaining
              </p>
            )}

            {preflight.blockers && preflight.blockers.length > 0 && (
              <ul className="mb-4 space-y-2 text-sm">
                {preflight.blockers.map((n) => (
                  <li key={n} className="flex gap-2 text-[var(--danger)]">
                    <span aria-hidden>✕</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}

            {preflight.warnings && preflight.warnings.length > 0 && (
              <ul className="mb-4 space-y-2 text-sm">
                {preflight.warnings.map((n) => (
                  <li key={n} className="flex gap-2 text-[var(--warning)]">
                    <span aria-hidden>⚠</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">What is a role-address?</p>
              <p className="mt-1">
                Generic inboxes like <code className="text-foreground">info@</code>,{' '}
                <code className="text-foreground">admin@</code>, or <code className="text-foreground">support@</code>{' '}
                hurt deliverability on bulk sends. Use personal addresses when possible.
              </p>
              <p className="mt-2">
                <Link href="/dashboard/contacts" className="font-medium text-[var(--primary)] underline underline-offset-2">
                  Open Contacts
                </Link>{' '}
                to edit your list, or pick a different list above.
              </p>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Save as draft first, then fix any blockers on the review screen before you start sending.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
