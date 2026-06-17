'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Card, CardBody, EmptyState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { AuditLogEntry } from '@/lib/types';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await api.adminListAuditLogs(token);
    setLogs(res.logs);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return (
    <AdminShell title="Audit log">
      {loading ? (
        <Skeleton className="h-64" />
      ) : logs.length === 0 ? (
        <EmptyState title="No audit entries yet" message="Security and auth events will appear here." />
      ) : (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-t border-border">
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3">{log.actorEmail || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {log.targetType ? `${log.targetType}:${log.targetId || '—'}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </AdminShell>
  );
}
