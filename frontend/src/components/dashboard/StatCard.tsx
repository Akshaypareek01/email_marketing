'use client';

import Link from 'next/link';
import { Card, CardBody } from '@/components/ui';

interface StatCardProps {
  label: string;
  value: string | number;
  href?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

/**
 * KPI stat card for dashboard overview rows.
 */
export function StatCard({ label, value, href, tone = 'default' }: StatCardProps) {
  const color =
    tone === 'success'
      ? 'var(--accent)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--primary)';

  const inner = (
    <Card className={href ? 'transition hover:border-[var(--primary)]/30 hover:shadow-md' : ''}>
      <CardBody>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color }}>
          {value}
        </p>
      </CardBody>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 rounded-xl">
        {inner}
      </Link>
    );
  }

  return inner;
}
