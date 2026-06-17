'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { AdminTenant } from '@/lib/types';
import { AdminShell } from '@/components/AdminShell';
import { Card, Input, Button, Badge, statusTone, Skeleton, EmptyState } from '@/components/ui';

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (search = '') => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.adminListTenants(token, { q: search });
      setTenants(res.tenants);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleStatus(t: AdminTenant) {
    const token = getToken();
    if (!token) return;
    const next = t.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !confirm(`Suspend "${t.name}"? Their sending will stop immediately.`)) return;
    setBusy(t._id);
    try {
      const res = await api.adminSetTenantStatus(token, t._id, next);
      setTenants((prev) => prev.map((x) => (x._id === t._id ? res.tenant : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Tenants" action={<span className="text-sm text-muted-foreground">{total} total</span>}>
      <div className="mb-4 max-w-sm">
        <form onSubmit={(e) => { e.preventDefault(); load(q); }}>
          <Input
            placeholder="Search tenants…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : tenants.length === 0 ? (
          <EmptyState title="No tenants found" message="No accounts match your search yet." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-semibold">Tenant</th>
                <th className="px-5 py-3 font-semibold">Slug</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t._id} className="border-b border-border last:border-0 transition hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/admin/tenants/${t._id}`} className="hover:text-[var(--primary)] hover:underline">{t.name}</Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{t.slug}</td>
                  <td className="px-5 py-3"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                  <td className="px-5 py-3 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant={t.status === 'active' ? 'destructive' : 'secondary'}
                      loading={busy === t._id}
                      onClick={() => toggleStatus(t)}
                    >
                      {t.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </AdminShell>
  );
}
