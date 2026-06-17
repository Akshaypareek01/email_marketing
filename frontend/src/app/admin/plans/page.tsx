'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Plan } from '@/lib/types';
import { AdminShell } from '@/components/AdminShell';
import { AdminBillingGatewaySettings } from '@/components/admin/AdminBillingGatewaySettings';
import { Card, CardBody, Input, Textarea, Button, Badge, Skeleton, EmptyState } from '@/components/ui';

type Draft = {
  name: string;
  description: string;
  priceRupees: string;
  interval: 'month' | 'year';
  monthlyEmailQuota: string;
  maxContacts: string;
  maxDomains: string;
  maxTeamUsers: string;
  attachmentMb: string;
  features: string;
  isPublic: boolean;
  stripePriceId: string;
  razorpayPlanId: string;
};

const EMPTY: Draft = {
  name: '',
  description: '',
  priceRupees: '',
  interval: 'month',
  monthlyEmailQuota: '',
  maxContacts: '',
  maxDomains: '',
  maxTeamUsers: '',
  attachmentMb: '10',
  features: '',
  isPublic: true,
  stripePriceId: '',
  razorpayPlanId: '',
};

const inr = (minor: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

function toDraft(p: Plan): Draft {
  return {
    name: p.name,
    description: p.description ?? '',
    priceRupees: String(p.priceMinor / 100),
    interval: p.interval,
    monthlyEmailQuota: String(p.monthlyEmailQuota),
    maxContacts: String(p.maxContacts),
    maxDomains: String(p.maxDomains),
    maxTeamUsers: String(p.maxTeamUsers),
    attachmentMb: String(p.attachmentMb),
    features: p.features.join('\n'),
    isPublic: p.isPublic,
    stripePriceId: p.stripePriceId ?? '',
    razorpayPlanId: p.razorpayPlanId ?? '',
  };
}

function toPayload(d: Draft) {
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    priceMinor: Math.round(Number(d.priceRupees || 0) * 100),
    currency: 'INR',
    interval: d.interval,
    monthlyEmailQuota: Number(d.monthlyEmailQuota || 0),
    maxContacts: Number(d.maxContacts || 0),
    maxDomains: Number(d.maxDomains || 0),
    maxTeamUsers: Number(d.maxTeamUsers || 0),
    attachmentMb: Number(d.attachmentMb || 0),
    features: d.features.split('\n').map((f) => f.trim()).filter(Boolean),
    isPublic: d.isPublic,
    stripePriceId: d.stripePriceId.trim(),
    razorpayPlanId: d.razorpayPlanId.trim(),
  };
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.listPlans(token);
      setPlans(res.plans);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setError('');
    setShowForm(true);
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setDraft(toDraft(p));
    setError('');
    setShowForm(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(draft);
      if (editing) {
        const res = await api.updatePlan(token, editing._id, payload);
        setPlans((prev) => prev.map((x) => (x._id === editing._id ? res.plan : x)));
      } else {
        const res = await api.createPlan(token, payload);
        setPlans((prev) => [...prev, res.plan]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save plan');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Plan) {
    const token = getToken();
    if (!token) return;
    if (!confirm(`Deactivate "${p.name}"? It will be hidden from new signups.`)) return;
    setBusy(p._id);
    try {
      await api.deletePlan(token, p._id);
      setPlans((prev) => prev.map((x) => (x._id === p._id ? { ...x, isActive: false } : x)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell
      title="Plans"
      action={<Button size="sm" onClick={openCreate}>New plan</Button>}
    >
      <AdminBillingGatewaySettings />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState title="No plans yet" message="Create your first pricing plan to start selling." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p._id} className={p.isActive ? '' : 'opacity-60'}>
              <CardBody>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.description || '—'}</p>
                  </div>
                  <Badge tone={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'active' : 'inactive'}</Badge>
                </div>

                <p className="mt-4 text-2xl font-bold">
                  {inr(p.priceMinor, p.currency)}
                  <span className="text-sm font-normal text-muted-foreground">/{p.interval}</span>
                </p>

                <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <li>{p.monthlyEmailQuota.toLocaleString('en-IN')} emails / mo</li>
                  <li>{p.maxContacts.toLocaleString('en-IN')} contacts · {p.maxDomains} domains</li>
                  <li>{p.maxTeamUsers} team users · {p.attachmentMb} MB attachments</li>
                  {!p.isPublic && <li className="text-amber-600">Hidden (private)</li>}
                </ul>

                <div className="mt-5 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>Edit</Button>
                  {p.isActive && (
                    <Button size="sm" variant="destructive" loading={busy === p._id} onClick={() => remove(p)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 sm:p-8">
          <Card className="w-full max-w-2xl">
            <CardBody>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">{editing ? 'Edit plan' : 'New plan'}</h2>
                <button onClick={() => setShowForm(false)} className="text-sm text-muted-foreground hover:text-foreground">Close</button>
              </div>

              <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
                  <Input label="Price (₹)" type="number" min="0" value={draft.priceRupees} onChange={(e) => setDraft({ ...draft, priceRupees: e.target.value })} required />
                </div>

                <Textarea label="Description" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="Emails / month" type="number" min="0" value={draft.monthlyEmailQuota} onChange={(e) => setDraft({ ...draft, monthlyEmailQuota: e.target.value })} required />
                  <Input label="Max contacts" type="number" min="0" value={draft.maxContacts} onChange={(e) => setDraft({ ...draft, maxContacts: e.target.value })} required />
                  <Input label="Max domains" type="number" min="0" value={draft.maxDomains} onChange={(e) => setDraft({ ...draft, maxDomains: e.target.value })} required />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input label="Team users" type="number" min="0" value={draft.maxTeamUsers} onChange={(e) => setDraft({ ...draft, maxTeamUsers: e.target.value })} required />
                  <Input label="Attachment MB" type="number" min="0" value={draft.attachmentMb} onChange={(e) => setDraft({ ...draft, attachmentMb: e.target.value })} required />
                  <label className="flex flex-col text-sm">
                    <span className="mb-1.5 font-medium">Interval</span>
                    <select
                      className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
                      value={draft.interval}
                      onChange={(e) => setDraft({ ...draft, interval: e.target.value as 'month' | 'year' })}
                    >
                      <option value="month">Monthly</option>
                      <option value="year">Yearly</option>
                    </select>
                  </label>
                </div>

                <Textarea label="Features (one per line)" rows={4} value={draft.features} onChange={(e) => setDraft({ ...draft, features: e.target.value })} />

                <Input
                  label="Stripe Price ID (optional)"
                  placeholder="price_..."
                  value={draft.stripePriceId}
                  onChange={(e) => setDraft({ ...draft, stripePriceId: e.target.value })}
                />

                <Input
                  label="Razorpay Plan ID (optional)"
                  placeholder="plan_... — auto-created if empty"
                  value={draft.razorpayPlanId}
                  onChange={(e) => setDraft({ ...draft, razorpayPlanId: e.target.value })}
                />

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.isPublic} onChange={(e) => setDraft({ ...draft, isPublic: e.target.checked })} />
                  Show on public pricing page
                </label>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" loading={saving}>{editing ? 'Save changes' : 'Create plan'}</Button>
                </div>
              </form>
            </CardBody>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
