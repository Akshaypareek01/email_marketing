import type { EmailThread, ThreadMessage } from '@/lib/types';

export type FolderName = 'Primary' | 'Inbox' | 'Starred' | 'Sent' | 'Drafts' | 'Spam' | 'Archive';

export const tagColors: Record<string, string> = {
  client: 'bg-indigo-500/10 text-indigo-700',
  internal: 'bg-sky-500/10 text-sky-700',
  sent: 'bg-violet-500/10 text-violet-700',
  finance: 'bg-emerald-500/10 text-emerald-700',
};

/**
 * Format thread/message timestamps for inbox list and detail views.
 */
export function formatInboxTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Derive a display name from email and optional name field.
 */
export function displayName(email: string, name?: string): string {
  if (name?.trim()) return name.trim();
  const local = email.split('@')[0] || email;
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Infer a tag label for thread list badges.
 */
export function threadTag(thread: EmailThread): string {
  if (thread.lastDirection === 'inbound') return 'client';
  return 'sent';
}

/**
 * Split plain-text body into paragraphs for rendering.
 */
export function messageParagraphs(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Extract readable body text from a thread message.
 */
export function bubbleBody(msg: ThreadMessage): string {
  if (msg.textBody?.trim()) return msg.textBody;
  if (msg.htmlBody) return msg.htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

/**
 * Prefix subject with Re: when replying.
 */
export function replySubject(subject: string): string {
  const s = subject.trim() || '(no subject)';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Resolve reply recipient from thread context.
 */
export function counterpartyForReply(
  mailboxAddr: string,
  thread: EmailThread,
  messages: ThreadMessage[]
): string {
  if (thread.counterpartyEmail) return thread.counterpartyEmail;
  const lastOther = [...messages].reverse().find((m) => m.fromAddress !== mailboxAddr);
  if (lastOther) return lastOther.fromAddress;
  const last = messages[messages.length - 1];
  if (last?.direction === 'outbound') return last.toAddress;
  return last?.fromAddress || '';
}

export const inboxFolders: { name: FolderName; icon: string }[] = [
  { name: 'Primary', icon: 'ri-inbox-line' },
  { name: 'Starred', icon: 'ri-star-line' },
  { name: 'Sent', icon: 'ri-send-plane-line' },
  { name: 'Inbox', icon: 'ri-mail-download-line' },
  { name: 'Drafts', icon: 'ri-draft-line' },
  { name: 'Spam', icon: 'ri-spam-2-line' },
  { name: 'Archive', icon: 'ri-archive-line' },
];
