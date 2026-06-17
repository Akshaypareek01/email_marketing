'use client';

import { attachmentIcon, formatFileSize, type PendingAttachment } from '@/lib/attachments';

/**
 * Shows attachments queued for send in reply/compose areas.
 */
export function PendingAttachmentList({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
      {items.map((file) => (
        <div
          key={file.id}
          className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5"
        >
          <i className={`${attachmentIcon(file.contentType)} shrink-0 text-[0.95rem] text-[var(--primary)]`} />
          <div className="min-w-0">
            <p className="max-w-[10rem] truncate text-[0.76rem] font-medium">{file.name}</p>
            <p className="text-[0.66rem] text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${file.name}`}
          >
            <i className="ri-close-line text-[0.85rem]" />
          </button>
        </div>
      ))}
    </div>
  );
}
