'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Badge, Button, Card, CardBody, Input, Skeleton, statusTone } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';

interface SuppressionRow {
  _id: string;
  email: string;
  reason: string;
  scope: string;
  tenant?: { name: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminSuppressionsPage() {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.adminListSuppressions(token, { q: search || undefined });
      setRows(res.suppressions as SuppressionRow[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRemove(id: string) {
    const token = getToken();
    if (!token || !confirm('Remove this suppression entry?')) return;
    await api.adminDeleteSuppression(token, id);
    await load();
  }

  async function onSync() {
    const token = getToken();
    if (!token) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await api.adminSyncSuppressions(token);
      setSyncMsg(res.message || `Synced ${res.synced} addresses`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminShell
      title="Suppression list"
      action={
        <Button size="sm" loading={syncing} onClick={onSync}>
          Sync suppressions
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Global and per-tenant suppressed addresses. Bounces and complaints are added automatically.
      </p>
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {syncMsg && <p className="mb-4 text-sm text-[var(--accent)]">{syncMsg}</p>}

      <div className="mb-4 max-w-sm">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email…"
          aria-label="Search suppressions"
        />
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <Skeleton className="m-4 h-48" />
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No suppressions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 font-medium">Scope</th>
                    <th className="px-4 py-3 font-medium">Tenant</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r._id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{r.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(r.reason === 'bounce' || r.reason === 'complaint' ? 'failed' : r.reason)}>
                          {r.reason}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 capitalize">{r.scope}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.tenant?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onRemove(r._id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </AdminShell>
  );
}
