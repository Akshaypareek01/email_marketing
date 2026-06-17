import type { DnsRecord } from '@/lib/types';

/** Relative record name for provider UIs (@ = zone apex). */
export function dnsRecordName(host: string, domainName: string): string {
  if (host === domainName) return '@';
  const suffix = `.${domainName}`;
  if (host.endsWith(suffix)) {
    const relative = host.slice(0, -suffix.length);
    return relative || '@';
  }
  return host;
}

function toFqdn(host: string, domainName: string): string {
  if (host === domainName || host === '@') return `${domainName}.`;
  if (host.endsWith('.')) return host;
  return `${host}.`;
}

function escapeTxt(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatBindLine(record: DnsRecord, domainName: string): string {
  const fqdn = toFqdn(record.host, domainName);
  const ttl = '3600';
  const type = record.type.toUpperCase();

  if (type === 'MX') {
    const match = record.value.trim().match(/^(\d+)\s+(.+)$/);
    const priority = match?.[1] ?? '10';
    const target = (match?.[2] ?? record.value).trim();
    const mxTarget = target.endsWith('.') ? target : `${target}.`;
    return `${fqdn}\t${ttl}\tIN\tMX\t${priority}\t${mxTarget}`;
  }

  if (type === 'TXT') {
    return `${fqdn}\t${ttl}\tIN\tTXT\t"${escapeTxt(record.value)}"`;
  }

  if (type === 'CNAME') {
    const target = record.value.endsWith('.') ? record.value : `${record.value}.`;
    return `${fqdn}\t${ttl}\tIN\tCNAME\t${target}`;
  }

  return `${fqdn}\t${ttl}\tIN\t${type}\t${record.value}`;
}

function purposeLabel(purpose: string): string {
  return purpose.replace(/_/g, ' ').toUpperCase();
}

/**
 * BIND-style zone snippet — paste into Route53 import, Cloudflare, etc.
 */
export function formatDnsZoneFile(domainName: string, records: DnsRecord[]): string {
  const generated = new Date().toISOString();
  const header = [
    `; DNS records for ${domainName}`,
    `; Generated: ${generated}`,
    `;`,
    `; Columns in provider UI often map as:`,
    `;   Type | Name (relative) | Content/Value | TTL`,
    `;`,
  ];

  const blocks = records.map((record) => {
    const name = dnsRecordName(record.host, domainName);
    const meta = [
      `; --- ${purposeLabel(record.purpose)} ---`,
      `; Type: ${record.type} | Name: ${name} | Purpose: ${record.purpose}`,
    ];
    if (record.type.toUpperCase() === 'MX') {
      const match = record.value.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        meta.push(`; Priority: ${match[1]} | Mail server: ${match[2]}`);
      }
    } else {
      meta.push(`; Value: ${record.value}`);
    }
    return [...meta, formatBindLine(record, domainName)].join('\n');
  });

  return [...header, ...blocks].join('\n\n') + '\n';
}

export function downloadDnsRecords(domainName: string, records: DnsRecord[]): void {
  if (!records.length) return;

  const body = formatDnsZoneFile(domainName, records);
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${domainName}-dns.zone`;
  anchor.click();
  URL.revokeObjectURL(url);
}
