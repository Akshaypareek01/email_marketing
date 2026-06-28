'use client';

import { FormEvent, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { ContactList } from '@/lib/types';

const CONSENT_PRESETS = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'web_form', label: 'Web form opt-in' },
  { value: 'event', label: 'Event / in-person' },
  { value: 'purchased', label: 'Customer / purchase' },
  { value: 'other', label: 'Other (custom)' },
];

interface ContactCreateModalProps {
  lists: ContactList[];
  /** List to pre-select (e.g. the one currently being viewed). */
  defaultListId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Add a single contact manually — no CSV required. Drops the contact into the
 * chosen list (defaults to the list the user is currently viewing).
 */
export function ContactCreateModal({ lists, defaultListId = '', onClose, onSaved }: ContactCreateModalProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [listId, setListId] = useState(defaultListId);
  const [preset, setPreset] = useState('manual');
  const [customConsent, setCustomConsent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    const consent = preset === 'other' ? customConsent.trim() : preset;
    setLoading(true);
    setError('');
    try {
      await api.createContact(token, {
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        company: company.trim() || undefined,
        listIds: listId ? [listId] : undefined,
        consent,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-contact-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 id="create-contact-title" className="text-lg font-semibold">Add a contact</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add one person manually — no CSV needed.</p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            required
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Select label="Add to list" value={listId} onChange={(e) => setListId(e.target.value)}>
            <option value="">No list</option>
            {lists.map((l) => (
              <option key={l._id} value={l._id}>{l.name}</option>
            ))}
          </Select>
          <Select label="Consent / source" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {CONSENT_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
          {preset === 'other' && (
            <Input
              label="Custom consent note"
              value={customConsent}
              onChange={(e) => setCustomConsent(e.target.value)}
              required
            />
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>Add contact</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
