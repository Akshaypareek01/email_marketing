'use client';

import { useState } from 'react';
import {
  attachmentIcon,
  canPreviewAttachment,
  formatFileSize,
  openAttachmentBlob,
} from '@/lib/attachments';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { MessageAttachment } from '@/lib/types';

/**
 * Renders downloadable/previewable attachments on a thread message.
 */
export function AttachmentList({
  messageId,
  items,
}: {
  messageId: string;
  items: MessageAttachment[];
}) {
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');

  if (!items.length) return null;

  async function onOpen(index: number, file: MessageAttachment) {
    const token = getToken();
    if (!token) return;

    const key = `${messageId}-${index}`;
    setOpeningKey(key);
    setOpenError('');

    try {
      const blob = await api.fetchMessageAttachment(token, messageId, index);
      openAttachmentBlob(blob, file.filename, file.contentType);
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : 'Could not open attachment');
    } finally {
      setOpeningKey(null);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Attachments
      </p>
      {openError && <p className="mb-2 text-[0.72rem] text-[var(--danger)]">{openError}</p>}
      <div className="flex flex-wrap gap-2">
        {items.map((file, index) => {
          const key = `${messageId}-${index}`;
          const loading = openingKey === key;
          const preview = canPreviewAttachment(file.contentType);
          return (
            <button
              key={key}
              type="button"
              disabled={loading || !!openingKey}
              onClick={() => onOpen(index, file)}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left transition hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5 disabled:cursor-wait disabled:opacity-60"
              title={preview ? `Open ${file.filename}` : `Download ${file.filename}`}
            >
              <i className={`${attachmentIcon(file.contentType)} text-[1rem] text-[var(--primary)]`} />
              <div className="min-w-0">
                <p className="max-w-[12rem] truncate text-[0.78rem] font-medium">{file.filename}</p>
                <p className="text-[0.68rem] text-muted-foreground">
                  {loading
                    ? 'Opening…'
                    : `${formatFileSize(file.size)} · ${preview ? 'View' : 'Download'}`}
                </p>
              </div>
              <i
                className={`shrink-0 text-[0.9rem] text-muted-foreground ${preview ? 'ri-external-link-line' : 'ri-download-2-line'}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
