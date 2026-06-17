'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui';
import type { AccountOverview } from '@/lib/types';

interface OnboardingChecklistProps {
  account: AccountOverview;
}

interface Step {
  id: string;
  label: string;
  done: boolean;
  href: string;
}

/**
 * Onboarding checklist until domain → plan → contacts → campaign path is complete.
 */
export function OnboardingChecklist({ account }: OnboardingChecklistProps) {
  const steps: Step[] = [
    {
      id: 'domain',
      label: 'Verify a sending domain',
      done: account.resources.activeDomains > 0,
      href: '/dashboard/domains',
    },
    {
      id: 'plan',
      label: 'Choose a plan',
      done: account.subscription.planId != null && account.subscription.status === 'active',
      href: '/dashboard/billing',
    },
    {
      id: 'contacts',
      label: 'Import contacts',
      done: account.resources.contacts > 0,
      href: '/dashboard/contacts',
    },
    {
      id: 'campaign',
      label: 'Send your first campaign',
      done: account.resources.campaignsSent > 0,
      href: '/dashboard/campaigns',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Getting started</p>
          <p className="text-xs text-muted-foreground">
            {completed} of {steps.length} complete
          </p>
        </div>
        <Badge tone="primary">{steps.length - completed} left</Badge>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-muted"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  step.done
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-border bg-muted text-muted-foreground'
                }`}
                aria-hidden
              >
                {step.done ? '✓' : ''}
              </span>
              <span className={step.done ? 'text-muted-foreground line-through' : 'font-medium'}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
