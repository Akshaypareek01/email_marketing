'use client';

import { getStoredUser } from '@/lib/auth';
import { isTenantAdmin } from '@/lib/roles';
import type { SessionUser } from '@/lib/types';

/**
 * Returns whether the current session user is a tenant admin.
 */
export function useTenantAdmin(): boolean {
  return isTenantAdmin(getStoredUser<SessionUser>());
}
