'use client';

import { FormEvent, useRef, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { downloadContactsTemplate, guessColumnMapping, parseCsv } from '@/lib/csv';
import type { ContactList, ImportResult } from '@/lib/types';

interface ImportCsvModalProps {
  lists: ContactList[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Modal flow: pick CSV → map columns → import via API.
 */
export function ImportCsvModal({ lists, onClose, onDone }: ImportCsvModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listId, setListId] = useState('');
  const [consent, setConsent] = useState('imported');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  function onFileChange(file: File | null) {
    if (!file) return;
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsv(text);
      if (!parsed.length) {
        setError('CSV is empty or invalid');
        return;
      }
      const hdrs = Object.keys(parsed[0]);
      setHeaders(hdrs);
      setRows(parsed);
      setMapping(guessColumnMapping(hdrs));
    };
    reader.readAsText(file);
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (!rows.length || !mapping.email) {
      setError('Map the email column before importing');
      return;
    }
    const token = getToken();
    if (!token) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.importContacts(token, {
        rows,
        mapping,
        listId: listId || undefined,
        consent,
      });
      setResult(res.results);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 id="import-title" className="text-lg font-semibold">Import CSV</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Suppressed addresses are skipped automatically.
        </p>

        {!rows.length ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              New to this? Download our sample file, fill in your contacts, then upload it.{' '}
              <button
                type="button"
                onClick={downloadContactsTemplate}
                className="font-medium text-[var(--primary)] underline-offset-2 hover:underline"
              >
                Download template
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] || null)}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Choose CSV file
            </Button>
          </div>
        ) : (
          <form onSubmit={onImport} className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{rows.length} rows detected</p>
            <Select label="Add to list (optional)" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">No list</option>
              {lists.map((l) => (
                <option key={l._id} value={l._id}>{l.name}</option>
              ))}
            </Select>
            <Select label="Consent / source for import" value={consent} onChange={(e) => setConsent(e.target.value)}>
              <option value="imported">CSV import</option>
              <option value="web_form">Web form opt-in</option>
              <option value="event">Event / in-person</option>
              <option value="purchased">Customer / purchase</option>
              <option value="manual">Manual entry</option>
            </Select>
            {(['email', 'firstName', 'lastName', 'company'] as const).map((field) => (
              <Select
                key={field}
                label={field === 'firstName' ? 'First name column' : field === 'lastName' ? 'Last name column' : `${field} column`}
                value={mapping[field] || ''}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                required={field === 'email'}
              >
                <option value="">—</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </Select>
            ))}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {result && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p>Imported: {result.imported} · Skipped: {result.skipped} · Suppressed: {result.suppressed}</p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 max-h-24 overflow-y-auto text-xs text-muted-foreground">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>Row {e.row}: {e.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" loading={loading}>Import</Button>
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </form>
        )}

        {!rows.length && (
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}
