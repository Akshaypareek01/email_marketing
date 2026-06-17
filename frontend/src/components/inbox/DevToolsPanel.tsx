'use client';

import { FormEvent } from 'react';

type DevToolsPanelProps = {
  simulateError: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

/**
 * Developer-only panel to simulate inbound client replies for threading tests.
 */
export function DevToolsPanel({ simulateError, onSubmit }: DevToolsPanelProps) {
  return (
    <section className="mt-4 rounded-xl border border-dashed border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Simulate client reply</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste outbound Message-ID into In-Reply-To to thread the reply.
      </p>
      <form onSubmit={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          name="fromAddress"
          type="email"
          required
          placeholder="client@example.com"
          className="rounded-lg border border-border px-3 py-2 text-sm sm:col-span-2"
        />
        <input name="fromName" placeholder="Name" className="rounded-lg border border-border px-3 py-2 text-sm" />
        <input name="subject" placeholder="Subject" className="rounded-lg border border-border px-3 py-2 text-sm" />
        <input
          name="inReplyTo"
          placeholder="In-Reply-To (Message-ID)"
          className="rounded-lg border border-border px-3 py-2 font-mono text-xs sm:col-span-2"
        />
        <textarea
          name="textBody"
          rows={2}
          placeholder="Reply body"
          className="rounded-lg border border-border px-3 py-2 text-sm sm:col-span-2"
        />
        {simulateError && <p className="text-sm text-[var(--danger)] sm:col-span-2">{simulateError}</p>}
        <button
          type="submit"
          className="rounded-lg bg-foreground px-4 py-2 text-sm text-background sm:col-span-2"
        >
          Record inbound
        </button>
      </form>
    </section>
  );
}
