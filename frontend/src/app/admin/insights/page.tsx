'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Badge, Card, CardBody, CardHeader, EmptyState, Skeleton, statusTone } from '@/components/ui';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { formatPrice } from '@/lib/format';
import type { RevenueBreakdown, PlanDistributionRow, TopCustomer } from '@/lib/types';

export default function AdminInsightsPage() {
  const [revenue, setRevenue] = useState<RevenueBreakdown | null>(null);
  const [plans, setPlans] = useState<PlanDistributionRow[]>([]);
  const [customers, setCustomers] = useState<TopCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      api.adminRevenue(token),
      api.adminPlanDistribution(token),
      api.adminTopCustomers(token, 10),
    ])
      .then(([r, p, c]) => {
        setRevenue(r.revenue);
        setPlans(p.plans);
        setCustomers(c.customers);
      })
      .catch(() => {
        setRevenue(null);
        setPlans([]);
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminShell title="Insights">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="mt-6 h-64" />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Insights">
      {/* Revenue — grouped by currency, net of refunds */}
      <Card>
        <CardHeader title="Revenue received" subtitle="Lifetime and this month, net of refunds — grouped by currency" />
        <CardBody>
          {!revenue || revenue.lifetimeByCurrency.length === 0 ? (
            <EmptyState title="No revenue yet" message="Paid transactions will appear here." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {revenue.lifetimeByCurrency.map((row) => {
                const thisMonth = revenue.thisMonthByCurrency.find((m) => m.currency === row.currency);
                return (
                  <div key={row.currency} className="rounded-lg border border-border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.currency}</p>
                    <p className="mt-1 text-3xl font-bold" style={{ color: 'var(--accent)' }}>
                      {formatPrice(row.netMinor, row.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">net lifetime · {row.count} payments</p>
                    <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
                      <span className="text-muted-foreground">This month</span>
                      <span className="font-medium">{formatPrice(thisMonth?.grossMinor ?? 0, row.currency)}</span>
                    </div>
                    {row.refundedMinor > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Refunded</span>
                        <span className="font-medium text-[var(--danger)]">
                          −{formatPrice(row.refundedMinor, row.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Plan distribution + per-plan revenue */}
      <Card className="mt-6">
        <CardHeader title="Membership plans" subtitle="Active tenants and revenue per plan" />
        <CardBody className="overflow-x-auto p-0">
          {plans.length === 0 ? (
            <div className="p-6"><EmptyState title="No plans" message="Create plans to see distribution." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Active tenants</th>
                  <th className="px-4 py-3 font-medium">Purchases</th>
                  <th className="px-4 py-3 font-medium">Revenue (month)</th>
                  <th className="px-4 py-3 font-medium">Revenue (lifetime)</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.planId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      {p.name} {!p.isActive && <Badge tone="warning">inactive</Badge>}
                    </td>
                    <td className="px-4 py-3">{formatPrice(p.priceMinor, p.currency)}/{p.interval}</td>
                    <td className="px-4 py-3">{p.activeTenants}</td>
                    <td className="px-4 py-3">{p.lifetimePurchases}</td>
                    <td className="px-4 py-3">{formatPrice(p.thisMonthRevenueMinor, p.currency)}</td>
                    <td className="px-4 py-3">{formatPrice(p.lifetimeRevenueMinor, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Best customers */}
      <Card className="mt-6">
        <CardHeader title="Best customers" subtitle="Top tenants by net revenue" />
        <CardBody className="overflow-x-auto p-0">
          {customers.length === 0 ? (
            <div className="p-6"><EmptyState title="No customers yet" message="Paying tenants will be ranked here." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Payments</th>
                  <th className="px-4 py-3 font-medium">Net revenue</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.tenantId} className="border-t border-border">
                    <td className="px-4 py-3 font-bold text-muted-foreground">{c.rank}</td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td className="px-4 py-3">{c.purchases}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--accent)' }}>
                      {formatPrice(c.netRevenueMinor, c.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </AdminShell>
  );
}
