'use client';

import type { Mailbox } from '@/lib/types';
import {
  formatInboxTime,
  inboxFolders,
  tagColors,
  type FolderName,
} from '@/lib/inboxUtils';

type InboxSidebarProps = {
  mailboxes: Mailbox[];
  mailboxId: string;
  mailboxAddress: string;
  syncLoading: boolean;
  lastSyncAt: string | null;
  activeFolder: FolderName;
  folderCounts: Record<FolderName, number>;
  tagCounts: Record<string, number>;
  devOpen: boolean;
  onMailboxChange: (id: string) => void;
  onCompose: () => void;
  onSelectFolder: (name: FolderName) => void;
  onToggleDev: () => void;
};

/**
 * Left rail: mailbox picker, folders, tags, and dev-tools toggle.
 */
export function InboxSidebar({
  mailboxes,
  mailboxId,
  mailboxAddress,
  syncLoading,
  lastSyncAt,
  activeFolder,
  folderCounts,
  tagCounts,
  devOpen,
  onMailboxChange,
  onCompose,
  onSelectFolder,
  onToggleDev,
}: InboxSidebarProps) {
  return (
    <div className="flex w-[220px] shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="border-b border-border p-4">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Mailbox
        </p>
        {mailboxes.length ? (
          <select
            value={mailboxId}
            onChange={(e) => onMailboxChange(e.target.value)}
            aria-label="Select mailbox"
            className="mb-2 w-full rounded-xl border border-border bg-card px-2 py-2 text-[0.78rem] font-semibold outline-none focus:border-[var(--primary)]"
          >
            {mailboxes.map((m) => (
              <option key={m._id} value={m._id}>
                {m.address}
              </option>
            ))}
          </select>
        ) : (
          <p className="mb-2 text-[0.72rem] text-muted-foreground">No mailboxes — create one first.</p>
        )}
        <p className="mb-3 text-[0.72rem] text-muted-foreground">
          {syncLoading
            ? 'Syncing from Stalwart…'
            : lastSyncAt
              ? `Synced ${formatInboxTime(lastSyncAt)} · ${mailboxAddress || '—'}`
              : `Receiving as ${mailboxAddress || '—'} (MX → Stalwart → sync)`}
        </p>
        <button
          type="button"
          onClick={onCompose}
          disabled={!mailboxId}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--primary)] py-2.5 text-[0.85rem] font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <i className="ri-edit-line" />
          Compose
        </button>
      </div>

      <div className="px-3 py-3">
        {inboxFolders.map((f) => (
          <button
            key={f.name}
            type="button"
            onClick={() => onSelectFolder(f.name)}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-[0.82rem] font-medium transition-colors ${
              activeFolder === f.name
                ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'text-foreground hover:bg-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <i className={`${f.icon} text-[0.9rem]`} />
              {f.name}
            </span>
            {folderCounts[f.name] > 0 && (
              <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[0.65rem] font-medium text-white">
                {folderCounts[f.name]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto border-t border-border px-4 py-4">
        <p className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Tags
        </p>
        {Object.entries(tagCounts)
          .filter(([, c]) => c > 0)
          .map(([name, count]) => (
            <button
              key={name}
              type="button"
              className="flex w-full items-center justify-between rounded-lg py-1.5 text-left"
            >
              <span className="flex items-center gap-2 text-[0.8rem] capitalize">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${tagColors[name]?.split(' ')[0] || 'bg-muted-foreground'}`}
                />
                {name}
              </span>
              <span className="text-[0.72rem] text-muted-foreground">{count}</span>
            </button>
          ))}
        <button
          type="button"
          onClick={onToggleDev}
          className="mt-3 w-full text-left text-[0.72rem] text-muted-foreground hover:text-foreground"
        >
          {devOpen ? 'Hide' : 'Show'} developer tools
        </button>
      </div>
    </div>
  );
}
