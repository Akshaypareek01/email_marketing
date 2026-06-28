'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist';
import { QuotaBar } from '@/components/dashboard/QuotaBar';
import { ReputationWidget } from '@/components/dashboard/ReputationWidget';
import { StatCard } from '@/components/dashboard/StatCard';
import { Badge, ButtonLink, Card, CardBody, CardHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth';
import type { AccountOverview, SessionUser } from '@/lib/types';

export default function DashboardPage() {
  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getStoredUser<SessionUser>();

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api
      .accountOverview(token)
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  const needsVerify = user && user.emailVerified === false;

  return (
    <DashboardShell
      title={`Welcome${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
      subtitle="Your email marketing control center"
      action={
        <ButtonLink href="/dashboard/campaigns" variant="primary" size="sm">
          New campaign
        </ButtonLink>
      }
    >
      {needsVerify && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>Verify your email to send mail and run campaigns.</span>
          <Link href="/verify-email" className="font-semibold underline underline-offset-2">
            Verify now
          </Link>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </div>
      ) : account ? (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <QuotaBar
              used={account.subscription.emailsSentThisPeriod}
              total={account.subscription.monthlyEmailQuota}
              remaining={account.subscription.remaining}
              usedPct={account.subscription.usedPct}
              planName={account.subscription.planName}
            />
            <ReputationWidget
              bounceRate={account.reputation.bounceRate}
              complaintRate={account.reputation.complaintRate}
              sent={account.reputation.sent}
            />
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Domains" value={account.resources.domains} href="/dashboard/domains" />
            <StatCard
              label="Active domains"
              value={account.resources.activeDomains}
              href="/dashboard/domains"
              tone={account.resources.activeDomains > 0 ? 'success' : 'warning'}
            />
            <StatCard label="Mailboxes" value={account.resources.mailboxes} href="/dashboard/mailboxes" />
            <StatCard
              label="Plan"
              value={account.subscription.planName || 'None'}
              href="/dashboard/billing"
              tone={account.subscription.planId ? 'default' : 'warning'}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader title="Quick actions" subtitle="Common tasks to get sending" />
                <CardBody>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { href: '/dashboard/domains', label: 'Add domain', desc: 'Connect & verify DNS' },
                      { href: '/dashboard/contacts', label: 'Import contacts', desc: 'CSV upload & lists' },
                      { href: '/dashboard/templates', label: 'Create template', desc: 'HTML + merge tags' },
                      { href: '/dashboard/compose', label: 'Send one-off', desc: 'Single email' },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="rounded-lg border border-border p-4 transition hover:border-[var(--primary)]/30 hover:bg-muted/50"
                      >
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                      </Link>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
            <OnboardingChecklist account={account} />
          </div>

          <Card className="mt-6">
            <CardHeader
              title="Account status"
              action={
                <Badge tone={account.tenant.status === 'active' ? 'success' : 'danger'}>
                  {account.tenant.status}
                </Badge>
              }
            />
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Subscription</dt>
                  <dd className="mt-0.5 font-medium capitalize">{account.subscription.status}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Billing period</dt>
                  <dd className="mt-0.5 font-medium">
                    Started {new Date(account.subscription.periodStart).toLocaleDateString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Organization</dt>
                  <dd className="mt-0.5 font-medium">{account.tenant.name}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Could not load account overview.</p>
      )}
    </DashboardShell>
  );
}
