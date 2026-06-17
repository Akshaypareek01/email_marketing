'use client';

import { Fraunces } from 'next/font/google';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ComposeModal } from '@/components/inbox/ComposeModal';
import { DevToolsPanel } from '@/components/inbox/DevToolsPanel';
import { InboxSidebar } from '@/components/inbox/InboxSidebar';
import { ThreadList } from '@/components/inbox/ThreadList';
import { ThreadReader, ThreadReaderEmpty } from '@/components/inbox/ThreadReader';
import {
  pendingAttachmentFromFile,
  serializeAttachments,
  validateNewAttachments,
  type PendingAttachment,
} from '@/lib/attachments';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import {
  counterpartyForReply,
  displayName,
  replySubject,
  threadTag,
  type FolderName,
} from '@/lib/inboxUtils';
import type { EmailThread, Mailbox, ThreadFilter, ThreadMessage } from '@/lib/types';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  style: ['italic'],
});

export default function MailPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [mailboxId, setMailboxId] = useState('');
  const [mailboxAddress, setMailboxAddress] = useState('');
  const [apiFilter, setApiFilter] = useState<ThreadFilter>('inbox');
  const [activeFolder, setActiveFolder] = useState<FolderName>('Inbox');
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [activeThread, setActiveThread] = useState<EmailThread | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [composeAttachments, setComposeAttachments] = useState<PendingAttachment[]>([]);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState({ to: '', subject: '', body: '' });
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [devOpen, setDevOpen] = useState(false);
  const [simulateError, setSimulateError] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const loadMailboxes = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await api.listMailboxes(token);
    const list = res.mailboxes as Mailbox[];
    setMailboxes(list);
    if (!list.length) return;

    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('activeMailboxId') : null;
    const pick = list.find((m) => m._id === saved) || list[0];
    setMailboxId(pick._id);
    setMailboxAddress(pick.address);
    sessionStorage.setItem('activeMailboxId', pick._id);
  }, []);

  const loadThreads = useCallback(async () => {
    const token = getToken();
    if (!token || !mailboxId) return;
    setLoadingThreads(true);
    setError('');
    try {
      const res = await api.listThreads(token, mailboxId, apiFilter);
      setThreads(res.threads as EmailThread[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load threads');
    } finally {
      setLoadingThreads(false);
    }
  }, [mailboxId, apiFilter]);

  const loadThreadDetail = useCallback(
    async (threadId: string) => {
      const token = getToken();
      if (!token) return;
      setLoadingMessages(true);
      try {
        const res = await api.getThreadMessages(token, threadId, mailboxId);
        setActiveThread(res.thread as EmailThread);
        setMessages(res.messages as ThreadMessage[]);
      } catch {
        setActiveThread(null);
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [mailboxId]
  );

  useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  useEffect(() => {
    const m = mailboxes.find((x) => x._id === mailboxId);
    if (m) setMailboxAddress(m.address);
  }, [mailboxId, mailboxes]);

  useEffect(() => {
    if (!selectedThreadId) {
      setActiveThread(null);
      setMessages([]);
    }
    setReplyText('');
    setReplyAttachments([]);
    setSendError('');
  }, [selectedThreadId]);

  function addAttachments(
    files: FileList | null,
    current: PendingAttachment[],
    setAttachments: (items: PendingAttachment[]) => void
  ) {
    if (!files?.length) return;
    const validationError = validateNewAttachments(current, files);
    if (validationError) {
      setSendError(validationError);
      return;
    }
    setSendError('');
    setAttachments([...current, ...Array.from(files).map(pendingAttachmentFromFile)]);
  }

  const folderToFilter = (name: FolderName): ThreadFilter | null => {
    if (name === 'Primary') return 'all';
    if (name === 'Inbox') return 'inbox';
    if (name === 'Sent') return 'sent';
    return null;
  };

  function selectFolder(name: FolderName) {
    setActiveFolder(name);
    setSelectedThreadId(null);
    const f = folderToFilter(name);
    if (f) setApiFilter(f);
    else if (name === 'Starred') setApiFilter('all');
    else setApiFilter('all');
  }

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (activeFolder === 'Starred') {
      list = list.filter((t) => starredIds.includes(t._id));
    }
    if (activeFolder === 'Drafts' || activeFolder === 'Spam' || activeFolder === 'Archive') {
      list = [];
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        (t.counterpartyEmail || '').toLowerCase().includes(q) ||
        t.snippet.toLowerCase().includes(q)
    );
  }, [threads, activeFolder, starredIds, searchQuery]);

  const folderCounts = useMemo(() => {
    const inbox = threads.filter((t) => t.lastDirection === 'inbound').length;
    const sent = threads.filter((t) => t.lastDirection === 'outbound').length;
    const starred = threads.filter((t) => starredIds.includes(t._id)).length;
    return {
      Primary: threads.length,
      Inbox: inbox,
      Sent: sent,
      Starred: starred,
      Drafts: 0,
      Spam: 0,
      Archive: 0,
    } as Record<FolderName, number>;
  }, [threads, starredIds]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { client: 0, internal: 0, sent: 0, finance: 0 };
    threads.forEach((t) => {
      const tag = threadTag(t);
      counts[tag] = (counts[tag] || 0) + 1;
    });
    return counts;
  }, [threads]);

  const activeListItem = filteredThreads.find((t) => t._id === selectedThreadId);
  const counterpartyEmail = activeThread?.counterpartyEmail || (activeListItem?.counterpartyEmail ?? '');
  const counterpartyName = displayName(counterpartyEmail);

  function toggleStar(id: string, ev: React.MouseEvent) {
    ev.stopPropagation();
    setStarredIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSendReply() {
    const token = getToken();
    if (!token || !mailboxId) return;
    if (!replyText.trim() && !replyAttachments.length) return;
    if (!selectedThreadId && !activeThread) return;
    setSendLoading(true);
    setSendError('');
    try {
      const to = counterpartyEmail || counterpartyForReply(mailboxAddress, activeThread!, messages);
      const attachments = replyAttachments.length ? await serializeAttachments(replyAttachments) : undefined;
      await api.sendEmail(token, {
        mailboxId,
        to,
        subject: replySubject(activeThread?.subject || ''),
        html: replyText,
        threadId: selectedThreadId || undefined,
        attachments,
      });
      setReplyText('');
      setReplyAttachments([]);
      await loadThreads();
      if (selectedThreadId) await loadThreadDetail(selectedThreadId);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Send failed');
    } finally {
      setSendLoading(false);
    }
  }

  async function onSendCompose() {
    const token = getToken();
    if (!token || !mailboxId) return;
    if (!composeDraft.body.trim() && !composeAttachments.length) return;
    setSendLoading(true);
    setSendError('');
    try {
      const attachments = composeAttachments.length ? await serializeAttachments(composeAttachments) : undefined;
      const res = (await api.sendEmail(token, {
        mailboxId,
        to: composeDraft.to,
        subject: composeDraft.subject,
        html: composeDraft.body,
        attachments,
      })) as { threadId?: string };
      setComposeDraft({ to: '', subject: '', body: '' });
      setComposeAttachments([]);
      setComposeOpen(false);
      await loadThreads();
      if (res.threadId) {
        setSelectedThreadId(res.threadId);
        await loadThreadDetail(res.threadId);
      }
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Send failed');
    } finally {
      setSendLoading(false);
    }
  }

  const refreshMailboxMail = useCallback(async () => {
    const token = getToken();
    if (!token || !mailboxId) return;
    setSyncLoading(true);
    setError('');
    try {
      await api.syncMailboxInbox(token, mailboxId);
      setLastSyncAt(new Date().toISOString());
      const res = await api.listThreads(token, mailboxId, apiFilter);
      setThreads(res.threads as EmailThread[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sync inbox from Stalwart');
    } finally {
      setSyncLoading(false);
    }
  }, [mailboxId, apiFilter]);

  useEffect(() => {
    if (!mailboxId) return;
    sessionStorage.setItem('activeMailboxId', mailboxId);
    loadThreads();
  }, [mailboxId, apiFilter, loadThreads]);

  useEffect(() => {
    if (selectedThreadId) loadThreadDetail(selectedThreadId);
  }, [selectedThreadId, loadThreadDetail]);

  async function onSimulateInbound(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSimulateError('');
    const token = getToken();
    if (!token || !mailboxId) return;
    const form = new FormData(e.currentTarget);
    try {
      await api.recordInboundEmail(token, {
        mailboxId,
        fromAddress: String(form.get('fromAddress')),
        fromName: String(form.get('fromName') || '') || undefined,
        subject: String(form.get('subject') || '') || undefined,
        textBody: String(form.get('textBody') || '') || undefined,
        inReplyTo: String(form.get('inReplyTo') || '').trim() || undefined,
      });
      e.currentTarget.reset();
      await loadThreads();
      if (selectedThreadId) await loadThreadDetail(selectedThreadId);
    } catch (err) {
      setSimulateError(err instanceof ApiError ? err.message : 'Could not record message');
    }
  }

  function onMailboxChange(id: string) {
    setMailboxId(id);
    setSelectedThreadId(null);
    const m = mailboxes.find((x) => x._id === id);
    if (m) setMailboxAddress(m.address);
  }

  return (
    <div className={`flex min-h-screen bg-background ${fraunces.variable}`}>
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col p-4">
        {error && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex min-h-[calc(100vh-2rem)] flex-1">
            <InboxSidebar
              mailboxes={mailboxes}
              mailboxId={mailboxId}
              mailboxAddress={mailboxAddress}
              syncLoading={syncLoading}
              lastSyncAt={lastSyncAt}
              activeFolder={activeFolder}
              folderCounts={folderCounts}
              tagCounts={tagCounts}
              devOpen={devOpen}
              onMailboxChange={onMailboxChange}
              onCompose={() => setComposeOpen(true)}
              onSelectFolder={selectFolder}
              onToggleDev={() => setDevOpen((v) => !v)}
            />

            <ThreadList
              activeFolder={activeFolder}
              frauncesClass={fraunces.className}
              mailboxId={mailboxId}
              loadingThreads={loadingThreads}
              filteredThreads={filteredThreads}
              selectedThreadId={selectedThreadId}
              starredIds={starredIds}
              searchQuery={searchQuery}
              syncLoading={syncLoading}
              onRefresh={refreshMailboxMail}
              onSearchChange={setSearchQuery}
              onSelectThread={setSelectedThreadId}
              onToggleStar={toggleStar}
            />

            {activeThread && selectedThreadId ? (
              <ThreadReader
                frauncesClass={fraunces.className}
                activeThread={activeThread}
                messages={messages}
                loadingMessages={loadingMessages}
                counterpartyName={counterpartyName}
                counterpartyEmail={counterpartyEmail}
                replyText={replyText}
                replyAttachments={replyAttachments}
                sendLoading={sendLoading}
                sendError={sendError}
                onReplyChange={setReplyText}
                onAddReplyAttachments={(files) => addAttachments(files, replyAttachments, setReplyAttachments)}
                onRemoveReplyAttachment={(id) =>
                  setReplyAttachments((prev) => prev.filter((file) => file.id !== id))
                }
                onSendReply={onSendReply}
              />
            ) : (
              <ThreadReaderEmpty />
            )}
          </div>
        </div>

        {devOpen && <DevToolsPanel simulateError={simulateError} onSubmit={onSimulateInbound} />}

        <ComposeModal
          open={composeOpen}
          frauncesClass={fraunces.className}
          composeDraft={composeDraft}
          composeAttachments={composeAttachments}
          sendLoading={sendLoading}
          sendError={sendError}
          onClose={() => setComposeOpen(false)}
          onDraftChange={setComposeDraft}
          onAddAttachments={(files) => addAttachments(files, composeAttachments, setComposeAttachments)}
          onRemoveAttachment={(id) =>
            setComposeAttachments((prev) => prev.filter((file) => file.id !== id))
          }
          onSend={onSendCompose}
          onCancel={() => {
            setComposeOpen(false);
            setComposeAttachments([]);
            setSendError('');
          }}
        />
      </main>
    </div>
  );
}
