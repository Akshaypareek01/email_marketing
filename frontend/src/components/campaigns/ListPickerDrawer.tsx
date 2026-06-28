'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui';
import type { ContactList } from '@/lib/types';

interface ListPickerDrawerProps {
  open: boolean;
  lists: ContactList[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Right-side drawer for choosing a contact list. Built for scale — searchable
 * cards that stay usable even with hundreds or thousands of lists, instead of a
 * long native <select>.
 */
export function ListPickerDrawer({ open, lists, selectedId, onSelect, onClose }: ListPickerDrawerProps) {
  const [query, setQuery] = useState('');

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lists;
    return lists.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q)
    );
  }, [lists, query]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Choose a contact list"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Choose a contact list</h2>
              <p className="text-xs text-muted-foreground">{lists.length} list{lists.length === 1 ? '' : 's'} available</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button>
          </div>
          <div className="mt-3">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lists…"
              aria-label="Search lists"
            />
          </div>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">No lists match “{query}”.</p>
          ) : (
            filtered.map((l) => {
              const active = l._id === selectedId;
              return (
                <button
                  key={l._id}
                  type="button"
                  onClick={() => {
                    onSelect(l._id);
                    onClose();
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]'
                      : 'border-border bg-white hover:border-[var(--primary)]/40 hover:bg-muted/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    {l.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{l.description}</p>
                    )}
                    <p className="mt-1.5 text-xs font-medium text-[var(--primary)]">
                      {(l.contactCount ?? 0).toLocaleString()} contact{(l.contactCount ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                  {active && (
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
