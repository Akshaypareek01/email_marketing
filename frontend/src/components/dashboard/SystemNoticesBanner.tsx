'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { SystemNotice } from '@/lib/types';

const toneClasses: Record<SystemNotice['severity'], string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  danger: 'border-red-200 bg-red-50 text-red-950',
};

/**
 * Fetches and displays active system notices for the tenant dashboard.
 */
export function SystemNoticesBanner() {
  const [notices, setNotices] = useState<SystemNotice[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await api.listSystemNotices(token);
      setNotices(res.notices);
    } catch {
      setNotices([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function dismiss(id: string) {
    const token = getToken();
    if (!token) return;
    setDismissing(id);
    try {
      await api.dismissSystemNotice(token, id);
      setNotices((prev) => prev.filter((n) => n._id !== id));
    } finally {
      setDismissing(null);
    }
  }

  if (notices.length === 0) return null;

  return (
    <div className="mb-6 space-y-3" aria-live="polite" aria-label="System notices">
      {notices.map((notice) => (
        <div
          key={notice._id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${toneClasses[notice.severity]}`}
          role="alert"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{notice.title}</p>
            <p className="mt-0.5 opacity-90">{notice.message}</p>
            {notice.actionHref && notice.actionLabel && (
              <Link
                href={notice.actionHref}
                className="mt-2 inline-block font-semibold underline underline-offset-2"
              >
                {notice.actionLabel}
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(notice._id)}
            disabled={dismissing === notice._id}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium opacity-70 transition hover:bg-black/5 hover:opacity-100 disabled:opacity-40"
            aria-label={`Dismiss notice: ${notice.title}`}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
