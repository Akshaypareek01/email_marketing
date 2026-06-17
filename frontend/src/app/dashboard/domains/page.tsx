'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { StatusBadge } from '@/components/StatusBadge';
import { Button, Card, CardBody, EmptyState, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import type { Domain } from '@/lib/types';

export default function DomainsPage() {
  const admin = useTenantAdmin();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const data = await api.listDomains(token);
    setDomains(data.domains as Domain[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const token = getToken();
    if (!token) return;

    try {
      await api.createDomain(token, name.trim().toLowerCase());
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add domain');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="Domains"
      subtitle="Connect and verify sending domains via AWS SES"
    >
      {!admin && <ReadOnlyBanner message="View-only — contact an admin to add or verify domains." />}
      {admin && (
      <Card className="mb-6">
        <CardBody>
          <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Input
                label="Domain name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="example.com"
                required
              />
            </div>
            <Button type="submit" loading={loading}>
              Add domain
            </Button>
          </form>
          {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        </CardBody>
      </Card>
      )}

      {domains.length === 0 ? (
        <EmptyState
          title="No domains yet"
          message="Add your first domain to start verifying DNS records for SES."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Domain</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {domains.map((d) => (
                <tr key={d._id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {admin ? (
                      <Link
                        href={`/dashboard/domains/${d._id}`}
                        className="font-medium text-[var(--primary)] hover:underline"
                      >
                        DNS & verify
                      </Link>
                    ) : (
                      <Link href={`/dashboard/domains/${d._id}`} className="text-muted-foreground hover:underline">
                        View DNS
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardShell>
  );
}
