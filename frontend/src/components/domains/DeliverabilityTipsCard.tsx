'use client';

import { Card, CardBody, CardHeader } from '@/components/ui';

/**
 * Deliverability checklist — why mail lands in spam and how to fix it.
 */
export function DeliverabilityTipsCard() {
  return (
    <Card className="mb-6 border-amber-200 bg-amber-50/50">
      <CardHeader title="Avoid spam folder" subtitle="Authentication + reputation" />
      <CardBody>
        <ul className="list-inside list-disc space-y-2 text-sm text-amber-950">
          <li>Publish all DNS records (SPF, DKIM, DMARC, MAIL FROM) and run verification.</li>
          <li>
            Upgrade DMARC from <code>p=none</code> to <code>p=quarantine</code> — we recommend the
            stricter record shown below for new domains.
          </li>
          <li>Warm up new domains — start with small lists, avoid role addresses (info@, admin@).</li>
          <li>Include unsubscribe link in templates; don&apos;t send to bounced/complained contacts.</li>
          <li>Set a clear <strong>From display name</strong> and use a real reply mailbox.</li>
          <li>For Gmail logo: upload <strong>SVG</strong> logo + BIMI DNS + strict DMARC.</li>
        </ul>
      </CardBody>
    </Card>
  );
}
