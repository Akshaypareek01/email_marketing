'use client';

import { Badge } from '@/components/ui';

interface ReputationWidgetProps {
  bounceRate: number;
  complaintRate: number;
  sent: number;
}

const BOUNCE_WARN = 3;
const BOUNCE_DANGER = 5;
const COMPLAINT_WARN = 0.05;
const COMPLAINT_DANGER = 0.1;

/**
 * Per-tenant reputation health gauge vs deliverability thresholds (DESIGN.md §9).
 */
export function ReputationWidget({ bounceRate, complaintRate, sent }: ReputationWidgetProps) {
  const bounceTone =
    bounceRate >= BOUNCE_DANGER ? 'danger' : bounceRate >= BOUNCE_WARN ? 'warning' : 'success';
  const complaintTone =
    complaintRate >= COMPLAINT_DANGER
      ? 'danger'
      : complaintRate >= COMPLAINT_WARN
        ? 'warning'
        : 'success';
  const overallTone =
    bounceTone === 'danger' || complaintTone === 'danger'
      ? 'danger'
      : bounceTone === 'warning' || complaintTone === 'warning'
        ? 'warning'
        : 'success';
  const overallLabel =
    overallTone === 'danger' ? 'At risk' : overallTone === 'warning' ? 'Watch' : 'Healthy';

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Reputation health</p>
        <Badge tone={overallTone}>{overallLabel}</Badge>
      </div>
      {sent === 0 ? (
        <p className="text-sm text-muted-foreground">
          Send emails to start tracking bounce and complaint rates.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Metric
            label="Bounce rate"
            value={`${bounceRate.toFixed(2)}%`}
            limit="5% limit"
            tone={bounceTone}
            pct={(bounceRate / BOUNCE_DANGER) * 100}
          />
          <Metric
            label="Complaint rate"
            value={`${complaintRate.toFixed(3)}%`}
            limit="0.1% limit"
            tone={complaintTone}
            pct={(complaintRate / COMPLAINT_DANGER) * 100}
          />
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Based on {sent.toLocaleString()} sends in the current window.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  limit,
  tone,
  pct,
}: {
  label: string;
  value: string;
  limit: string;
  tone: 'success' | 'warning' | 'danger';
  pct: number;
}) {
  const barColor =
    tone === 'danger'
      ? 'bg-[var(--danger)]'
      : tone === 'warning'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--accent)]';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{limit}</p>
    </div>
  );
}
