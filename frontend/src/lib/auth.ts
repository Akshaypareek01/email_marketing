const TOKEN_KEY = 'mailbox_token';
const REFRESH_KEY = 'mailbox_refresh';
const USER_KEY = 'mailbox_user';
const IMPERSONATING_KEY = 'mailbox_impersonating';
const ADMIN_BACKUP_KEY = 'mailbox_admin_backup';

interface SessionBackup {
  token: string;
  refreshToken?: string;
  user: object;
}

/**
 * Read the stored access token.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Read the stored refresh token.
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

/**
 * Persist access + refresh tokens and user profile.
 */
export function setSession(token: string, user: object, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem(REFRESH_KEY, refreshToken);
  }
}

/**
 * Update only the access token (after refresh).
 */
export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser<T>(): T | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Clear all session data.
 */
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(IMPERSONATING_KEY);
}

/**
 * Mark session as super-admin impersonation and stash admin credentials for exit.
 */
export function beginImpersonation(adminBackup: SessionBackup) {
  sessionStorage.setItem(ADMIN_BACKUP_KEY, JSON.stringify(adminBackup));
  sessionStorage.setItem(IMPERSONATING_KEY, '1');
}

/**
 * Whether the current tenant session is an admin impersonation.
 */
export function isImpersonating(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(IMPERSONATING_KEY) === '1';
}

/**
 * Restore the super-admin session after impersonation.
 */
export function exitImpersonation(): SessionBackup | null {
  const raw = sessionStorage.getItem(ADMIN_BACKUP_KEY);
  sessionStorage.removeItem(ADMIN_BACKUP_KEY);
  sessionStorage.removeItem(IMPERSONATING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionBackup;
  } catch {
    return null;
  }
}
