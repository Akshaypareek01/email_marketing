'use client';

import type { EmailThread } from '@/lib/types';
import { displayName, formatInboxTime, tagColors, threadTag, type FolderName } from '@/lib/inboxUtils';

type ThreadListProps = {
  activeFolder: FolderName;
  frauncesClass: string;
  mailboxId: string;
  loadingThreads: boolean;
  filteredThreads: EmailThread[];
  selectedThreadId: string | null;
  starredIds: string[];
  searchQuery: string;
  syncLoading: boolean;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onSelectThread: (id: string) => void;
  onToggleStar: (id: string, ev: React.MouseEvent) => void;
};

/**
 * Middle column: search, sync, and scrollable thread list.
 */
export function ThreadList({
  activeFolder,
  frauncesClass,
  mailboxId,
  loadingThreads,
  filteredThreads,
  selectedThreadId,
  starredIds,
  searchQuery,
  syncLoading,
  onRefresh,
  onSearchChange,
  onSelectThread,
  onToggleStar,
}: ThreadListProps) {
  return (
    <div className="flex w-[380px] shrink-0 flex-col overflow-hidden border-r border-border">
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {activeFolder}
            </p>
            <h2 className={`${frauncesClass} text-[1.65rem] italic leading-none`}>
              {loadingThreads ? '…' : filteredThreads.length} conversations
            </h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={syncLoading || !mailboxId}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Sync from Stalwart (IMAP)"
            aria-label="Sync inbox from Stalwart"
          >
            <i className={syncLoading ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'} />
          </button>
        </div>
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem] text-muted-foreground" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search emails"
            className="w-full rounded-xl border border-border bg-card py-2 pl-8 pr-3 text-[0.82rem] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!mailboxId && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Select a mailbox.</p>
        )}
        {mailboxId && !filteredThreads.length && !loadingThreads && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No conversations in this folder.
          </p>
        )}
        {filteredThreads.map((th) => {
          const email = th.counterpartyEmail || 'unknown';
          const from = displayName(email);
          const unread = th.lastDirection === 'inbound';
          const tag = threadTag(th);
          return (
            <div
              key={th._id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectThread(th._id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectThread(th._id)}
              className={`group flex cursor-pointer items-start gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-muted/50 ${
                selectedThreadId === th._id
                  ? 'bg-[var(--primary)]/10 shadow-[inset_3px_0_0_var(--primary)]'
                  : ''
              }`}
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[0.75rem] font-semibold text-[var(--primary)]">
                {from.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={`truncate text-[0.82rem] ${
                      unread ? 'font-bold' : 'font-medium text-muted-foreground'
                    }`}
                  >
                    {from}
                  </span>
                  <span className="ms-2 shrink-0 text-[0.7rem] text-muted-foreground">
                    {formatInboxTime(th.lastActivityAt)}
                  </span>
                </div>
                <div className={`mb-1 truncate text-[0.82rem] ${unread ? 'font-semibold' : ''}`}>
                  {th.subject}
                </div>
                <div className="line-clamp-2 text-[0.74rem] leading-5 text-muted-foreground">
                  {th.snippet}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-medium ${tagColors[tag] || tagColors.client}`}
                  >
                    {tag}
                  </span>
                  {unread && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                  )}
                </div>
              </div>
              <button type="button" onClick={(e) => onToggleStar(th._id, e)} className="mt-0.5 shrink-0">
                <i
                  className={`text-[0.9rem] ${
                    starredIds.includes(th._id)
                      ? 'ri-star-fill text-amber-500'
                      : 'ri-star-line text-muted-foreground'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
