'use client';

type Step = 'compose' | 'review' | 'send';

interface CampaignStepperProps {
  current: Step;
}

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 'compose', label: 'Compose', hint: 'Name, subject, audience' },
  { id: 'review', label: 'Review', hint: 'Pre-flight checks' },
  { id: 'send', label: 'Send', hint: 'Queue delivery' },
];

/**
 * Visual step indicator for the campaign creation flow.
 */
export function CampaignStepper({ current }: CampaignStepperProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);

  return (
    <nav aria-label="Campaign steps" className="mb-6">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <li key={step.id} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-stretch sm:gap-0">
              <div className="flex items-center gap-3 sm:w-full">
                <span
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    done
                      ? 'bg-emerald-600 text-white'
                      : active
                        ? 'bg-[var(--primary)] text-white'
                        : 'border border-border bg-muted text-muted-foreground',
                  ].join(' ')}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? '✓' : idx + 1}
                </span>
                {idx < STEPS.length - 1 && (
                  <span
                    className={['hidden h-px flex-1 sm:block', done ? 'bg-emerald-300' : 'bg-border'].join(' ')}
                    aria-hidden
                  />
                )}
              </div>
              <div className="min-w-0 pb-1 sm:mt-2 sm:pb-0">
                <p className={`text-sm font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
