'use client';

import { useRef } from 'react';
import type { EmailThread, ThreadMessage } from '@/lib/types';
import type { PendingAttachment } from '@/lib/attachments';
import { AttachmentList } from './AttachmentList';
import { PendingAttachmentList } from './PendingAttachmentList';
import {
  bubbleBody,
  displayName,
  formatInboxTime,
  messageParagraphs,
} from '@/lib/inboxUtils';

type ThreadReaderProps = {
  frauncesClass: string;
  activeThread: EmailThread;
  messages: ThreadMessage[];
  loadingMessages: boolean;
  counterpartyName: string;
  counterpartyEmail: string;
  replyText: string;
  replyAttachments: PendingAttachment[];
  sendLoading: boolean;
  sendError: string;
  onReplyChange: (value: string) => void;
  onAddReplyAttachments: (files: FileList | null) => void;
  onRemoveReplyAttachment: (id: string) => void;
  onSendReply: () => void;
};

/**
 * Right pane: thread header, message bubbles, and reply composer.
 */
export function ThreadReader({
  frauncesClass,
  activeThread,
  messages,
  loadingMessages,
  counterpartyName,
  counterpartyEmail,
  replyText,
  replyAttachments,
  sendLoading,
  sendError,
  onReplyChange,
  onAddReplyAttachments,
  onRemoveReplyAttachment,
  onSendReply,
}: ThreadReaderProps) {
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-5">
        <div className="mb-4 flex items-start justify-between">
          <h1 className={`max-w-3xl pe-4 ${frauncesClass} text-[1.8rem] italic leading-tight`}>
            {activeThread.subject}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {['ri-reply-line', 'ri-forward-line', 'ri-delete-bin-line', 'ri-more-2-fill'].map((icon) => (
              <button
                key={icon}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Thread action"
              >
                <i className={`${icon} text-[1rem]`} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[0.82rem] font-semibold text-[var(--primary)]">
            {counterpartyName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.85rem] font-semibold">{counterpartyName}</div>
            <div className="text-[0.75rem] text-muted-foreground">{counterpartyEmail}</div>
          </div>
          <div className="shrink-0 text-[0.75rem] text-muted-foreground">
            {formatInboxTime(activeThread.lastActivityAt)}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6">
        {loadingMessages ? (
          <p className="text-sm text-muted-foreground">Loading conversation…</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((msg) => {
              const isOut = msg.direction === 'outbound';
              const body = bubbleBody(msg);
              const paras = messageParagraphs(body);
              const sender = isOut ? 'You' : displayName(msg.fromAddress, msg.fromName);
              return (
                <div
                  key={msg._id}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <p className="text-[0.85rem] font-semibold">{sender}</p>
                      <p className="text-[0.72rem] text-muted-foreground">
                        {isOut ? `To: ${msg.toAddress}` : msg.fromAddress}
                      </p>
                    </div>
                    <span className="text-[0.72rem] text-muted-foreground">
                      {formatInboxTime(msg.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {(paras.length ? paras : [body || '(empty)']).map((para, i) => (
                      <p key={i} className="text-[0.92rem] leading-7">
                        {para}
                      </p>
                    ))}
                  </div>
                  {msg.attachments?.length ? (
                    <AttachmentList messageId={msg._id} items={msg.attachments} />
                  ) : null}
                  {isOut && msg.rfcMessageId && (
                    <p className="mt-4 border-t border-border pt-3 font-mono text-[0.68rem] text-muted-foreground">
                      Message-ID: {msg.rfcMessageId}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-6 py-4">
        <input
          ref={replyFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onAddReplyAttachments(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Reply draft
              </p>
              <p className="truncate text-[0.8rem]">
                To: {counterpartyName}{' '}
                <span className="text-muted-foreground">&lt;{counterpartyEmail}&gt;</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => replyFileInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              title="Attach files"
              aria-label="Attach files to reply"
            >
              <i className="ri-attachment-2" />
            </button>
          </div>
          <textarea
            rows={5}
            value={replyText}
            onChange={(e) => onReplyChange(e.target.value)}
            placeholder={`Write a clear reply to ${counterpartyName}...`}
            aria-label="Reply message"
            className="w-full resize-none border-0 bg-transparent px-4 py-4 text-[0.9rem] leading-6 outline-none placeholder:text-muted-foreground"
          />
          <PendingAttachmentList items={replyAttachments} onRemove={onRemoveReplyAttachment} />
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="text-[0.74rem] text-muted-foreground">
              {replyAttachments.length
                ? `${replyAttachments.length} attachment${replyAttachments.length === 1 ? '' : 's'}`
                : replyText.length
                  ? `${replyText.length} characters`
                  : 'Replies stay in this thread'}
            </div>
            {sendError && (
              <span className="mx-3 flex-1 truncate text-[0.74rem] text-[var(--danger)]">{sendError}</span>
            )}
            <button
              type="button"
              disabled={sendLoading || (!replyText.trim() && !replyAttachments.length)}
              onClick={onSendReply}
              className="flex items-center gap-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-[0.82rem] font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <i className="ri-send-plane-fill" />
              {sendLoading ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no thread is selected.
 */
export function ThreadReaderEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-muted/10">
      <div className="text-center text-muted-foreground">
        <i className="ri-mail-open-line mb-3 block text-5xl opacity-30" />
        <p className="text-[0.875rem]">Select an email to read</p>
      </div>
    </div>
  );
}
