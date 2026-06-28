'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import { DnsRecordTable } from '@/components/DnsRecordTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Button, Card, CardBody, Skeleton } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import { downloadDnsRecords } from '@/lib/dns-export';
import type { Domain } from '@/lib/types';

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3"
      />
    </svg>
  );
}

export default function DomainDetailPage() {
  const admin = useTenantAdmin();
  const { id } = useParams<{ id: string }>();
  const [domain, setDomain] = useState<Domain | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token || !id) return;
    const data = await api.getDomain(token, id);
    setDomain(data.domain as Domain);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function verify() {
    setMessage('');
    setError('');
    setLoading(true);
    const token = getToken();
    if (!token || !id) return;

    try {
      await api.verifyDomain(token, id);
      setMessage('Verification check completed.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  if (!domain) {
    return (
      <DashboardShell title="Domain">
        <Skeleton className="h-48" />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={domain.name}
      subtitle="DNS records for domain identity verification"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadDnsRecords(domain.name, domain.dnsRecords || [])} disabled={!domain.dnsRecords?.length}>
            <DownloadIcon className="h-4 w-4" />
            Download DNS
          </Button>
          {admin && (
            <Button size="sm" loading={loading} onClick={verify}>
              Run verification
            </Button>
          )}
        </div>
      }
    >
      {!admin && <ReadOnlyBanner />}
      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={domain.status} />
      </div>

      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card>
        <CardBody>
          <p className="mb-4 text-sm text-muted-foreground">
            Add these DNS records at your provider (Cloudflare, Route53, etc.), then run verification.
          </p>
          <DnsRecordTable records={domain.dnsRecords || []} />
        </CardBody>
      </Card>
    </DashboardShell>
  );
}
