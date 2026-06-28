'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import { ReadOnlyBanner } from '@/components/dashboard/ReadOnlyBanner';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { useTenantAdmin } from '@/hooks/useTenantAdmin';
import type { Domain, Mailbox } from '@/lib/types';

export default function MailboxesPage() {
  const admin = useTenantAdmin();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState('');
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [credentials, setCredentials] = useState<{ address: string; password: string } | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkPassword, setLinkPassword] = useState('');
  const [inboundEnabled, setInboundEnabled] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [d, m, overview] = await Promise.all([
      api.listDomains(token),
      api.listMailboxes(token),
      api.accountOverview(token).catch(() => null),
    ]);
    const domainList = (d.domains as Domain[]).filter((x) => x.status === 'active');
    setDomains(domainList);
    setMailboxes(m.mailboxes as Mailbox[]);
    setInboundEnabled(
      Boolean(
        (m as { inboundEmailEnabled?: boolean }).inboundEmailEnabled ??
          overview?.features?.inboundEmailEnabled
      )
    );
    if (domainList.length && !domainId) setDomainId(domainList[0]._id);
  }, [domainId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCredentials(null);
    setLoading(true);
    const token = getToken();
    if (!token) return;

    try {
      const res = await api.createMailbox(token, {
        domainId,
        localPart,
        displayName,
        ...(inboundEnabled && password.trim() ? { password: password.trim() } : {}),
      });
      const creds = (res as { credentials?: { address: string; password: string } }).credentials;
      const createdAddress = (res as { mailbox?: { address?: string } }).mailbox?.address;
      if (creds) setCredentials(creds);
      setLocalPart('');
      setDisplayName('');
      setPassword('');
      setSuccess(
        inboundEnabled
          ? 'Mailbox created and inbox provisioned.'
          : `Sender address ${createdAddress || 'created'}. Open Compose to send email.`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create mailbox');
    } finally {
      setLoading(false);
    }
  }

  async function onLinkStalwart(mailboxId: string) {
    setError('');
    setSuccess('');
    const token = getToken();
    if (!token || !linkPassword.trim()) return;

    setLoading(true);
    try {
      await api.linkMailboxCredentials(token, mailboxId, linkPassword.trim());
      setLinkId(null);
      setLinkPassword('');
      setSuccess('Mailbox credentials linked — open Mail and sync inbox.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to link credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell
      title="Sender addresses"
      subtitle={
        inboundEnabled
          ? 'Provision addresses on verified domains'
          : 'Create From addresses on verified domains — outbound sending only'
      }
    >
      {!admin && (
        <ReadOnlyBanner message="View-only — you can compose mail but cannot create sender addresses." />
      )}
      {admin && (
        <Card className="mb-6">
          <CardHeader
            title="Create sender address"
            subtitle={
              inboundEnabled
                ? 'Auto-provisions an inbox with IMAP credentials'
                : 'Registers a From address for campaigns and compose (no inbox setup)'
            }
          />
          <CardBody>
            <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Domain"
                value={domainId}
                onChange={(e) => setDomainId(e.target.value)}
                required
              >
                <option value="">Select active domain</option>
                {domains.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Input
                label="Local part"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="sales"
                required
              />
              <Input
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Sales Team"
              />
              {inboundEnabled && (
                <Input
                  label="Mailbox password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                  hint="Minimum 8 characters if set manually"
                />
              )}
              <div className="sm:col-span-2">
                <Button type="submit" loading={loading} disabled={!domains.length}>
                  Create sender address
                </Button>
                {!domains.length && (
                  <p className="mt-2 text-sm text-[var(--warning)]">
                    Verify a domain first (Domains → Verify DNS).
                  </p>
                )}
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {success && <p className="mb-4 text-sm text-[var(--accent)]">{success}</p>}
      {credentials && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50/50">
          <CardBody>
            <p className="font-medium text-emerald-900">Save these credentials:</p>
            <p className="mt-2 font-mono text-sm">{credentials.address}</p>
            <p className="font-mono text-sm">{credentials.password}</p>
            <ButtonLink href="/dashboard/compose" variant="link" className="mt-3">
              Go to Send email →
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      {mailboxes.length === 0 ? (
        <EmptyState
          title="No sender addresses yet"
          message="Verify a domain, then create addresses to use in Compose and campaigns."
        />
      ) : (
        <ul className="space-y-3">
          {mailboxes.map((m) => (
            <li key={m._id}>
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{m.address}</p>
                      {m.displayName && <p className="text-sm text-muted-foreground">{m.displayName}</p>}
                      {inboundEnabled ? (
                        <Badge tone={m.stalwartLinked ? 'success' : 'warning'} className="mt-2">
                          Inbox {m.stalwartLinked ? 'linked' : 'not linked'}
                        </Badge>
                      ) : (
                        <Badge tone="success" className="mt-2">
                          Outbound ready
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ButtonLink href="/dashboard/compose" variant="outline" size="sm">
                        Compose
                      </ButtonLink>
                      {inboundEnabled && (
                        <ButtonLink href="/dashboard/inbox" variant="outline" size="sm">
                          Open mail
                        </ButtonLink>
                      )}
                      {inboundEnabled && !m.stalwartLinked && admin && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setLinkId(linkId === m._id ? null : m._id)}
                        >
                          Link inbox
                        </Button>
                      )}
                    </div>
                  </div>
                  {inboundEnabled && linkId === m._id && admin && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <Input
                        type="password"
                        value={linkPassword}
                        onChange={(e) => setLinkPassword(e.target.value)}
                        placeholder="Mailbox password"
                        className="min-w-[200px] flex-1"
                        aria-label="Mailbox password"
                      />
                      <Button size="sm" loading={loading} onClick={() => onLinkStalwart(m._id)}>
                        Save
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </DashboardShell>
  );
}
