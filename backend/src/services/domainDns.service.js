import dns from 'node:dns/promises';
import { env } from '../config/env.js';

/**
 * Custom MAIL FROM subdomain for a domain (AWS SES convention).
 * @param {string} domainName
 */
export function mailFromSubdomain(domainName) {
  return `mail.${domainName}`;
}

/**
 * Generates DNS records required for domain onboarding (SES + mail routing).
 * @param {string} domainName
 * @param {string[]} [dkimTokens]
 */
export function generateDnsRecords(domainName, dkimTokens = []) {
  const mailFromHost = mailFromSubdomain(domainName);
  const sesMx = `feedback-smtp.${env.aws.region}.amazonses.com`;

  const records = [
    {
      type: 'TXT',
      host: domainName,
      value: 'v=spf1 include:amazonses.com ~all',
      purpose: 'spf',
      verified: false,
    },
    {
      type: 'TXT',
      host: `_dmarc.${domainName}`,
      value: 'v=DMARC1; p=none;',
      purpose: 'dmarc',
      verified: false,
    },
  ];

  // Inbound only — MX routes replies to Stalwart; not required for outbound-only sending.
  if (env.inboundEmailEnabled) {
    records.push({
      type: 'MX',
      host: domainName,
      value: `10 ${env.platformMxHost}`,
      purpose: 'mx',
      verified: false,
    });
  }

  records.push(
    {
      type: 'MX',
      host: mailFromHost,
      value: `10 ${sesMx}`,
      purpose: 'mail_from',
      verified: false,
    },
    {
      type: 'TXT',
      host: mailFromHost,
      value: 'v=spf1 include:amazonses.com ~all',
      purpose: 'mail_from',
      verified: false,
    }
  );

  for (const token of dkimTokens) {
    records.push({
      type: 'CNAME',
      host: `${token}._domainkey.${domainName}`,
      value: `${token}.dkim.amazonses.com`,
      purpose: 'dkim',
      verified: false,
    });
  }

  return records;
}

/**
 * Normalize TXT record chunks for comparison.
 * @param {string[][]} rows
 */
function flattenTxt(rows) {
  return rows.map((r) => r.join('')).join('');
}

/**
 * Check whether a DNS record is published (best-effort live lookup).
 * @param {{ type: string, host: string, value: string, purpose?: string }} record
 */
export async function checkDnsRecord(record) {
  const host = record.host.replace(/\.$/, '');
  const expected = record.value.trim().toLowerCase();

  try {
    if (record.type === 'TXT') {
      const rows = await dns.resolveTxt(host);
      const flat = flattenTxt(rows).toLowerCase();
      if (flat.includes(expected.replace(/;\s*$/, ''))) return true;
      if (record.purpose === 'spf' && flat.includes('include:amazonses.com')) return true;
      if (record.purpose === 'dmarc' && flat.includes('v=dmarc1')) return true;
      return false;
    }

    if (record.type === 'MX') {
      const rows = await dns.resolveMx(host);
      const target = expected.replace(/^\d+\s+/, '').toLowerCase();
      return rows.some((r) => r.exchange.toLowerCase() === target || r.exchange.toLowerCase().endsWith(`.${target}`));
    }

    if (record.type === 'CNAME') {
      const rows = await dns.resolveCname(host);
      const target = expected.toLowerCase();
      return rows.some((r) => r.toLowerCase() === target || r.toLowerCase().endsWith(`.${target}`));
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Verify all DNS records on a domain document (mutates record.verified flags).
 * @param {import('../models/Domain.js').Domain} domain
 */
export async function verifyDomainDnsRecords(domain) {
  for (const record of domain.dnsRecords) {
    record.verified = await checkDnsRecord(record);
  }
}

/**
 * Compute whether a domain is cleared for outbound sending.
 * Requires SES identity + DKIM + SPF + DMARC + custom MAIL FROM.
 * @param {import('../models/Domain.js').Domain} domain
 * @param {{ verifiedForSending?: boolean, dkimStatus?: string }} sesStatus
 */
export function computeVerifiedForSending(domain, sesStatus) {
  const sesOk = Boolean(sesStatus?.verifiedForSending);
  const dkimOk = sesStatus?.dkimStatus === 'SUCCESS';

  // Outbound-only: SES identity + DKIM in AWS is enough to send from any @domain address.
  if (!env.inboundEmailEnabled) {
    return sesOk && dkimOk;
  }

  const spfOk = domain.dnsRecords.filter((r) => r.purpose === 'spf').every((r) => r.verified);
  const dmarcOk = domain.dnsRecords.filter((r) => r.purpose === 'dmarc').every((r) => r.verified);
  const dkimRecordsOk = domain.dnsRecords.filter((r) => r.purpose === 'dkim').every((r) => r.verified);
  const mailFromOk = domain.dnsRecords.filter((r) => r.purpose === 'mail_from').every((r) => r.verified);
  const mxOk = domain.dnsRecords.filter((r) => r.purpose === 'mx').every((r) => r.verified);

  return sesOk && dkimOk && spfOk && dmarcOk && dkimRecordsOk && mailFromOk && mxOk;
}

/**
 * Refreshes DNS record rows from live SES DKIM tokens (keeps verified flags where host matches).
 * @param {import('../models/Domain.js').Domain} domain
 * @param {string[]} dkimTokens
 */
export function syncDomainDnsRecords(domain, dkimTokens = []) {
  const previous = domain.dnsRecords || [];
  domain.dnsRecords = generateDnsRecords(domain.name, dkimTokens);
  for (const record of domain.dnsRecords) {
    const match = previous.find(
      (r) => r.host === record.host && r.purpose === record.purpose && r.type === record.type
    );
    if (match?.verified) record.verified = true;
  }
}
