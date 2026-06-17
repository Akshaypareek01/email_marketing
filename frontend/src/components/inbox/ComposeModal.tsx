'use client';

import { useRef } from 'react';
import type { PendingAttachment } from '@/lib/attachments';
import { PendingAttachmentList } from './PendingAttachmentList';

type ComposeDraft = { to: string; subject: string; body: string };

type ComposeModalProps = {
  open: boolean;
  frauncesClass: string;
  composeDraft: ComposeDraft;
  composeAttachments: PendingAttachment[];
  sendLoading: boolean;
  sendError: string;
  onClose: () => void;
  onDraftChange: (draft: ComposeDraft) => void;
  onAddAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onCancel: () => void;
};

/**
 * Floating compose window for new outbound messages.
 */
export function ComposeModal({
  open,
  frauncesClass,
  composeDraft,
  composeAttachments,
  sendLoading,
  sendError,
  onClose,
  onDraftChange,
  onAddAttachments,
  onRemoveAttachment,
  onSend,
  onCancel,
}: ComposeModalProps) {
  const composeFileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(640px,calc(100vh-8rem))] w-[min(620px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--primary)]/20 bg-[var(--primary)] px-5 py-3 text-white">
        <div className="min-w-0">
          <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/65">
            New message
          </p>
          <h3 className={`truncate ${frauncesClass} text-[1.15rem] italic leading-none text-white`}>
            Compose email
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/75 hover:bg-white/10"
          aria-label="Close compose"
        >
          <i className="ri-close-line text-[1rem]" />
        </button>
      </div>
      <input
        ref={composeFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          onAddAttachments(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="grid grid-cols-[4.25rem_1fr] border-b border-border">
          <label htmlFor="compose-to" className="px-4 py-3 text-[0.78rem] font-medium text-muted-foreground">
            To
          </label>
          <input
            id="compose-to"
            type="email"
            value={composeDraft.to}
            onChange={(e) => onDraftChange({ ...composeDraft, to: e.target.value })}
            placeholder="client@example.com"
            className="border-0 bg-transparent px-4 py-3 text-[0.88rem] outline-none"
          />
        </div>
        <div className="grid grid-cols-[4.25rem_1fr] border-b border-border">
          <label htmlFor="compose-subject" className="px-4 py-3 text-[0.78rem] font-medium text-muted-foreground">
            Subject
          </label>
          <input
            id="compose-subject"
            type="text"
            value={composeDraft.subject}
            onChange={(e) => onDraftChange({ ...composeDraft, subject: e.target.value })}
            placeholder="Add a concise subject"
            className="border-0 bg-transparent px-4 py-3 text-[0.88rem] outline-none"
          />
        </div>
        <textarea
          value={composeDraft.body}
          onChange={(e) => onDraftChange({ ...composeDraft, body: e.target.value })}
          placeholder="Write the message..."
          aria-label="Compose message body"
          className="min-h-[200px] flex-1 resize-none border-0 bg-transparent px-5 py-5 text-[0.92rem] leading-7 outline-none placeholder:text-muted-foreground"
        />
        <PendingAttachmentList items={composeAttachments} onRemove={onRemoveAttachment} />
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => composeFileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-[0.8rem] font-medium hover:bg-muted"
          >
            <i className="ri-attachment-2" />
            Attach
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-card px-3 py-2 text-[0.8rem] font-medium hover:bg-muted"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-3">
          {sendError && (
            <span className="max-w-[12rem] truncate text-[0.74rem] text-[var(--danger)]">{sendError}</span>
          )}
          <button
            type="button"
            disabled={
              sendLoading ||
              !composeDraft.to ||
              !composeDraft.subject ||
              (!composeDraft.body.trim() && !composeAttachments.length)
            }
            onClick={onSend}
            className="flex items-center gap-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-[0.82rem] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <i className="ri-send-plane-fill" />
            {sendLoading ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </div>
    </div>
  );
}
