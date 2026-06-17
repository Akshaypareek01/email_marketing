'use client';

import { FormEvent, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Contact } from '@/lib/types';

const CONSENT_PRESETS = [
  { value: 'web_form', label: 'Web form opt-in' },
  { value: 'imported', label: 'CSV import' },
  { value: 'manual', label: 'Manual entry' },
  { value: 'event', label: 'Event / in-person' },
  { value: 'purchased', label: 'Customer / purchase' },
  { value: 'other', label: 'Other (custom)' },
];

interface ContactEditModalProps {
  contact: Contact;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edit contact fields including consent/source tracking.
 */
export function ContactEditModal({ contact, onClose, onSaved }: ContactEditModalProps) {
  const presetValues = CONSENT_PRESETS.map((p) => p.value);
  const initialPreset = presetValues.includes(contact.consent || '') ? contact.consent! : 'other';
  const [firstName, setFirstName] = useState(contact.firstName || '');
  const [lastName, setLastName] = useState(contact.lastName || '');
  const [company, setCompany] = useState(contact.company || '');
  const [preset, setPreset] = useState(initialPreset);
  const [customConsent, setCustomConsent] = useState(
    initialPreset === 'other' ? contact.consent || '' : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    const consent = preset === 'other' ? customConsent.trim() : preset;
    setLoading(true);
    setError('');
    try {
      await api.updateContact(token, contact._id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        company: company.trim(),
        consent,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-contact-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 id="edit-contact-title" className="text-lg font-semibold">Edit contact</h2>
        <p className="mt-1 truncate text-sm text-muted-foreground">{contact.email}</p>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
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
            <Button type="submit" loading={loading}>Save</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
