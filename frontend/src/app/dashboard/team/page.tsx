'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Role, TeamUser } from '@/lib/types';

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'user' | 'admin'>('user');
  const [inviting, setInviting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listTeamUsers(token);
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setInviting(true);
    setError('');
    setTempPassword('');
    try {
      const res = await api.inviteTeamMember(token, {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInviteName('');
      setInviteEmail('');
      if (res.tempPassword) setTempPassword(res.tempPassword);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  }

  async function onRemove(id: string) {
    const token = getToken();
    if (!token || !confirm('Remove this team member?')) return;
    try {
      await api.removeTeamUser(token, id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Remove failed');
    }
  }

  return (
    <DashboardShell title="Team" subtitle="Invite colleagues to your workspace">
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {tempPassword && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Temporary password (dev only): <code className="font-mono">{tempPassword}</code>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Members (${users.length})`} />
          <CardBody>
            {loading ? (
              <Skeleton className="h-32" />
            ) : users.length === 0 ? (
              <EmptyState title="No team members" message="Invite your first colleague." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} className="border-b border-border last:border-0">
                      <td className="py-3 font-medium">{u.name}</td>
                      <td className="py-3 text-muted-foreground">{u.email}</td>
                      <td className="py-3">
                        <Badge tone="neutral">{u.role as Role}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onRemove(u._id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Invite member" subtitle="They receive login instructions by email" />
          <CardBody>
            <form onSubmit={onInvite} className="space-y-4">
              <Input label="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
              <Input
                label="Email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
              <Select label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'user' | 'admin')}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
              <Button type="submit" loading={inviting}>
                Send invite
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </DashboardShell>
  );
}
