/**
 * Role helpers for tenant dashboard RBAC.
 */
import type { Role, SessionUser } from './types';

/**
 * Whether the user is a tenant or platform admin (can manage billing, team, domains).
 */
export function isTenantAdmin(user?: SessionUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

/**
 * Whether the user is a read-only tenant team member.
 */
export function isTenantUser(user?: SessionUser | null): boolean {
  return user?.role === 'user';
}

/**
 * Human-readable role label.
 */
export function roleLabel(role?: Role): string {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  return 'User';
}
