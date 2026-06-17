'use client';

import { useRef } from 'react';
import { PendingAttachmentList } from '@/components/inbox/PendingAttachmentList';
import {
  pendingAttachmentFromFile,
  type PendingAttachment,
  validateSupportAttachments,
} from '@/lib/supportAttachments';

interface SupportAttachmentPickerProps {
  items: PendingAttachment[];
  onChange: (items: PendingAttachment[]) => void;
  onError?: (message: string) => void;
}

/**
 * File picker for support ticket attachments (max 3 × 2MB).
 */
export function SupportAttachmentPicker({ items, onChange, onError }: SupportAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const err = validateSupportAttachments(items, files);
    if (err) {
      onError?.(err);
      return;
    }
    onChange([...items, ...Array.from(files).map(pendingAttachmentFromFile)]);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">Up to 3 files, 2MB each</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={items.length >= 3}
          className="text-sm font-medium text-[var(--primary)] disabled:opacity-50"
          aria-label="Add attachments"
        >
          Attach files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          aria-hidden
          onChange={(e) => onFilesSelected(e.target.files)}
        />
      </div>
      <PendingAttachmentList
        items={items}
        onRemove={(id) => onChange(items.filter((a) => a.id !== id))}
      />
    </div>
  );
}
