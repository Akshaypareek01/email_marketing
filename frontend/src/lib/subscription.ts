import type { AccountOverview } from './types';

type Sub = AccountOverview['subscription'];

/**
 * Human label for the subscription end / renewal date row.
 */
export function subscriptionPeriodLabel(sub: Sub): string {
  if (sub.status === 'trialing') return 'Trial ends on';
  if (sub.cancelAtPeriodEnd) return 'Access ends on';
  if (sub.status === 'active') return 'Renews on';
  return 'Period resets on';
}

/**
 * Date shown for subscription period / trial end.
 */
export function subscriptionPeriodDate(sub: Sub): string | null | undefined {
  if (sub.status === 'trialing') return sub.trialEndsAt ?? sub.periodResetAt;
  return sub.periodResetAt;
}

/**
 * Whether the "will not renew" cancellation banner applies.
 * Free trials do not auto-renew — that is expected, not a cancellation.
 */
export function showCancelAtPeriodEndNotice(sub: Sub): boolean {
  return Boolean(sub.cancelAtPeriodEnd && sub.status === 'active' && sub.planId);
}
