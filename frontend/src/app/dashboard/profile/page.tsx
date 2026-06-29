'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '@/components/DashboardShell';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Skeleton,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getRefreshToken, getStoredUser, getToken, setSession } from '@/lib/auth';
import { isTenantAdmin, roleLabel } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import {
  showCancelAtPeriodEndNotice,
  subscriptionPeriodDate,
  subscriptionPeriodLabel,
} from '@/lib/subscription';
import type { AccountOverview, SessionUser } from '@/lib/types';

interface MeUser {
  id?: string;
  _id?: string;
  name?: string;
  email?: string;
  role?: SessionUser['role'];
  tenantId?: string;
  emailVerified?: boolean;
  phone?: string;
  phoneCountryCode?: string;
}

/** Merge /auth/me payload with cached session user (handles legacy shapes). */
function resolveMeUser(meRes: { user?: unknown } | null, stored: SessionUser | null): MeUser {
  const fromApi = (meRes?.user || {}) as MeUser;
  const fromStore = (stored || {}) as MeUser;
  return {
    ...fromStore,
    ...fromApi,
    id: fromApi.id || fromApi._id || fromStore.id,
    email: fromApi.email || fromStore.email || '',
    name: fromApi.name || fromStore.name || '',
    phone: fromApi.phone ?? fromStore.phone ?? '',
    phoneCountryCode: fromApi.phoneCountryCode ?? fromStore.phoneCountryCode ?? '',
    emailVerified: fromApi.emailVerified ?? fromStore.emailVerified ?? false,
    role: fromApi.role || fromStore.role,
  };
}

function formatPhone(code?: string, number?: string): string {
  const c = (code || '').trim();
  const n = (number || '').trim();
  if (!c && !n) return '—';
  return `${c}${n}`.trim();
}

export default function ProfilePage() {
  const storedUser = getStoredUser<SessionUser>();
  const isAdmin = isTenantAdmin(storedUser);

  const [account, setAccount] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Cancel subscription
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [subNotice, setSubNotice] = useState('');
  const [subError, setSubError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [meRes, acct] = await Promise.all([
      api.me(token).catch(() => null),
      isAdmin ? api.accountOverview(token).catch(() => null) : Promise.resolve(null),
    ]);
    const u = resolveMeUser(meRes, storedUser);
    setName(u.name || '');
    setEmail(u.email || '');
    setEmailVerified(Boolean(u.emailVerified));
    setPhone(u.phone || '');
    setPhoneCountryCode(u.phoneCountryCode || '');
    setAccount(acct);
  }, [isAdmin, storedUser]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSavingProfile(true);
    setProfileError('');
    setProfileNotice('');
    try {
      const res = await api.updateProfile(token, { name, phone, phoneCountryCode });
      // Keep the cached session user in sync so the header/sidebar reflect the new name.
      const refresh = getRefreshToken() || undefined;
      setSession(token, res.user, refresh);
      setProfileNotice('Profile updated.');
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setPasswordError('');
    setPasswordNotice('');
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(token, { currentPassword, newPassword });
      setPasswordNotice('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setSavingPassword(false);
    }
  }

  async function onConfirmCancel() {
    const token = getToken();
    if (!token) return;
    setCanceling(true);
    setSubError('');
    setSubNotice('');
    try {
      const res = await api.billingCancel(token);
      setSubNotice(res.message || 'Subscription canceled.');
      setConfirmOpen(false);
      await load();
    } catch (err) {
      setSubError(err instanceof ApiError ? err.message : 'Could not cancel subscription');
    } finally {
      setCanceling(false);
    }
  }

  const sub = account?.subscription;
  const hasActivePaidPlan = Boolean(sub?.planId && (sub?.status === 'active' || sub?.status === 'past_due'));

  return (
    <DashboardShell title="Profile" subtitle="Manage your account and subscription">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Profile details */}
          <Card>
            <CardHeader title="Profile details" subtitle="Your name and contact number" />
            <CardBody>
              <form onSubmit={onSaveProfile} className="space-y-4">
                <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <Input
                    label="Code"
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                    placeholder="+91"
                  />
                  <Input
                    label="Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                  />
                </div>
                {profileError && <p className="text-sm text-[var(--danger)]">{profileError}</p>}
                {profileNotice && <p className="text-sm text-emerald-600">{profileNotice}</p>}
                <Button type="submit" loading={savingProfile}>
                  Save changes
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Change password */}
          <Card>
            <CardHeader title="Password" subtitle="Change your sign-in password" />
            <CardBody>
              <form onSubmit={onChangePassword} className="space-y-4">
                <Input
                  label="Current password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <Input
                  label="New password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  hint="At least 8 characters"
                  required
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {passwordError && <p className="text-sm text-[var(--danger)]">{passwordError}</p>}
                {passwordNotice && <p className="text-sm text-emerald-600">{passwordNotice}</p>}
                <Button type="submit" loading={savingPassword}>
                  Update password
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Account info */}
          <Card>
            <CardHeader title="Account" subtitle="Read-only account details" />
            <CardBody>
              <dl className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="flex items-center gap-2 font-medium">
                    {email || '—'}
                    <Badge tone={emailVerified ? 'success' : 'warning'}>
                      {emailVerified ? 'Verified' : 'Unverified'}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{formatPhone(phoneCountryCode, phone)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="font-medium">{roleLabel(storedUser?.role)}</dd>
                </div>
                {account?.tenant?.name && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Organization</dt>
                    <dd className="font-medium">{account.tenant.name}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {/* Subscription (admin only) */}
          {isAdmin && sub && (
            <Card>
              <CardHeader
                title="Subscription"
                action={
                  <Badge tone={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'info' : 'danger'}>
                    {sub.status}
                  </Badge>
                }
              />
              <CardBody>
                <dl className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd className="font-medium">{sub.planName || (sub.status === 'trialing' ? 'Free trial' : 'No plan')}</dd>
                  </div>
                  {sub.status === 'trialing' && sub.trialDaysLeft != null && !sub.trialExpired && (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">Trial remaining</dt>
                      <dd className="font-medium">
                        {sub.trialDaysLeft} day{sub.trialDaysLeft === 1 ? '' : 's'}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{subscriptionPeriodLabel(sub)}</dt>
                    <dd className="font-medium">{formatDate(subscriptionPeriodDate(sub))}</dd>
                  </div>
                </dl>

                {subError && <p className="mt-3 text-sm text-[var(--danger)]">{subError}</p>}
                {subNotice && <p className="mt-3 text-sm text-emerald-600">{subNotice}</p>}

                <div className="mt-4">
                  {showCancelAtPeriodEndNotice(sub) ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Your plan will not renew — active until {formatDate(sub.periodResetAt)}.
                    </p>
                  ) : sub.status === 'trialing' && sub.trialExpired ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      Your free trial has ended.{' '}
                      <a href="/dashboard/billing" className="font-semibold underline underline-offset-2">
                        Choose a plan
                      </a>{' '}
                      to keep sending.
                    </p>
                  ) : sub.status === 'trialing' ? (
                    <p className="text-sm text-muted-foreground">
                      Free trials do not auto-renew.{' '}
                      <a href="/dashboard/billing" className="font-medium text-[var(--primary)] underline underline-offset-2">
                        Upgrade to a paid plan
                      </a>{' '}
                      before your trial ends.
                    </p>
                  ) : hasActivePaidPlan ? (
                    <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
                      Cancel subscription
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No active paid subscription.{' '}
                      <a href="/dashboard/billing" className="font-medium text-[var(--primary)] underline underline-offset-2">
                        Choose a plan
                      </a>
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel subscription?"
        message={
          <>
            Your plan stays active until the end of the current billing period
            {sub?.periodResetAt ? ` (${formatDate(sub.periodResetAt)})` : ''}, then sending will stop.
            This cannot be undone — you would need to subscribe again.
          </>
        }
        confirmLabel="Yes, cancel"
        cancelLabel="Keep plan"
        loading={canceling}
        onConfirm={onConfirmCancel}
        onClose={() => !canceling && setConfirmOpen(false)}
      />
    </DashboardShell>
  );
}
