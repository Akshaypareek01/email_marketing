'use client';

import { useRouter } from 'next/navigation';
import { exitImpersonation, setSession } from '@/lib/auth';

/**
 * Banner shown when a super-admin is impersonating a tenant user.
 */
export function ImpersonationBanner() {
  const router = useRouter();

  function onExit() {
    const backup = exitImpersonation();
    if (backup) {
      setSession(backup.token, backup.user, backup.refreshToken);
      router.push('/admin/tenants');
      return;
    }
    router.push('/admin/login');
  }

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <span>
        <strong>Impersonation mode</strong> — you are viewing this tenant as their admin.
      </span>
      <button
        type="button"
        onClick={onExit}
        className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
      >
        Exit impersonation
      </button>
    </div>
  );
}
