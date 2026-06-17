'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { ImportCsvModal } from '@/components/contacts/ImportCsvModal';
import { ContactEditModal } from '@/components/contacts/ContactEditModal';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Skeleton,
  statusTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import type { Contact, ContactList, ContactStats } from '@/lib/types';

export default function ContactsPage() {
  const admin = useTenantAdmin();
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeListId, setActiveListId] = useState('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const [s, l, c] = await Promise.all([
        api.contactStats(token),
        api.listContactLists(token),
        api.listContacts(token, { listId: activeListId || undefined, q: search || undefined }),
      ]);
      setStats(s);
      setLists(l.lists);
      setContacts(c.contacts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [activeListId, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreateList(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !newListName.trim()) return;
    try {
      await api.createContactList(token, { name: newListName.trim() });
      setNewListName('');
      setShowNewList(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create list');
    }
  }

  async function onExport() {
    const token = getToken();
    if (!token) return;
    const url = api.exportContactsUrl(activeListId || undefined);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'contacts.csv';
    a.click();
  }

  async function onDeleteContact(id: string) {
    const token = getToken();
    if (!token || !confirm('Delete this contact?')) return;
    await api.deleteContact(token, id);
    await load();
  }

  return (
    <DashboardShell
      title="Contacts"
      subtitle="Manage audiences, lists, and CSV imports"
      action={
        admin ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onExport}>Export CSV</Button>
            <Button size="sm" onClick={() => setShowImport(true)}>Import CSV</Button>
          </div>
        ) : undefined
      }
    >
      {!admin && <ReadOnlyBanner message="View-only — you can browse contacts but cannot import, export, or edit." />}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {loading && !stats ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard label="Total contacts" value={stats?.total ?? 0} />
            <StatCard label="Subscribed" value={stats?.subscribed ?? 0} tone="success" />
            <StatCard label="Lists" value={stats?.lists ?? 0} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Lists"
            action={
              admin ? (
                <Button variant="ghost" size="sm" onClick={() => setShowNewList((v) => !v)} aria-label="New list">
                  +
                </Button>
              ) : undefined
            }
          />
          <CardBody className="space-y-1">
            {showNewList && admin && (
              <form onSubmit={onCreateList} className="mb-3 flex gap-2">
                <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="List name" required />
                <Button type="submit" size="sm">Add</Button>
              </form>
            )}
            <button
              type="button"
              onClick={() => setActiveListId('')}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${!activeListId ? 'bg-[var(--primary)]/10 font-medium text-[var(--primary)]' : 'hover:bg-muted'}`}
            >
              All contacts
            </button>
            {lists.map((l) => (
              <button
                key={l._id}
                type="button"
                onClick={() => setActiveListId(l._id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${activeListId === l._id ? 'bg-[var(--primary)]/10 font-medium text-[var(--primary)]' : 'hover:bg-muted'}`}
              >
                <span>{l.name}</span>
                <span className="text-xs text-muted-foreground">{l.contactCount ?? 0}</span>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Contacts"
            action={
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="max-w-xs"
                aria-label="Search contacts"
              />
            }
          />
          <CardBody className="p-0">
            {loading ? (
              <Skeleton className="m-4 h-48" />
            ) : contacts.length === 0 ? (
              <EmptyState
                title="No contacts yet"
                message="Import a CSV or add contacts manually."
                action={
                  admin ? <Button onClick={() => setShowImport(true)}>Import CSV</Button> : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Consent</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {contacts.map((c) => (
                      <tr key={c._id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.consent || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {admin && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setEditContact(c)} aria-label={`Edit ${c.email}`}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDeleteContact(c._id)} aria-label={`Delete ${c.email}`}>
                                Delete
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {showImport && admin && (
        <ImportCsvModal lists={lists} onClose={() => setShowImport(false)} onDone={load} />
      )}
      {editContact && admin && (
        <ContactEditModal contact={editContact} onClose={() => setEditContact(null)} onSaved={load} />
      )}
    </DashboardShell>
  );
}
