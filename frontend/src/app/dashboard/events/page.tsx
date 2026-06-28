'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { Badge, Card, CardBody, EmptyState, Skeleton, statusTone } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { EmailEvent } from '@/lib/types';

export default function EventsPage() {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api
      .listEvents(token)
      .then((data) => setEvents(data.events as EmailEvent[]))
      .finally(() => setLoading(false));
  }, []);

  const types = useMemo(() => {
    const set = new Set(events.map((e) => e.eventType));
    return ['all', ...Array.from(set).sort()];
  }, [events]);

  const filtered =
    filter === 'all' ? events : events.filter((e) => e.eventType === filter);

  return (
    <DashboardShell
      title="Email events"
      subtitle="Delivery, bounce, and complaint events"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              filter === t
                ? 'bg-[var(--primary)] text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No events yet"
          message="Send an email to see delivery events here."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Message ID</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((ev) => (
                  <tr key={ev._id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(ev.eventType)}>{ev.eventType}</Badge>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-mono text-xs">{ev.messageId}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DashboardShell>
  );
}
