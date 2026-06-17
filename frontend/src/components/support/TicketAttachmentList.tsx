'use client';

import { formatFileSize, downloadTicketAttachment } from '@/lib/supportAttachments';
import type { TicketAttachment } from '@/lib/types';

/**
 * Renders downloadable attachments on a support ticket message.
 */
export function TicketAttachmentList({ attachments }: { attachments?: TicketAttachment[] }) {
  if (!attachments?.length) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Message attachments">
      {attachments.map((a, i) => (
        <li key={`${a.filename}-${i}`}>
          <button
            type="button"
            onClick={() => downloadTicketAttachment(a.filename, a.contentType, a.content)}
            className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            aria-label={`Download ${a.filename}`}
          >
            {a.filename}
            {a.sizeBytes != null && (
              <span className="ml-1 text-muted-foreground">({formatFileSize(a.sizeBytes)})</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
