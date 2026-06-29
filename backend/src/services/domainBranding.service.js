import { env } from '../config/env.js';
import { Domain } from '../models/Domain.js';
import { syncBimiDnsRecord } from './domainDns.service.js';
import {
  buildBrandLogoKey,
  headObject,
  isR2Configured,
  presignUpload,
  publicObjectUrl,
} from './r2.service.js';

const BRAND_MIME = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_LOGO_BYTES = 512 * 1024;

/**
 * Update domain sender branding (display name + optional logo URL).
 * @param {string} tenantId
 * @param {string} domainId
 * @param {{ fromDisplayName?: string, logoUrl?: string }} input
 */
export async function updateDomainBranding(tenantId, domainId, input) {
  const domain = await Domain.findOne({ _id: domainId, tenantId });
  if (!domain) {
    const err = new Error('Domain not found');
    err.status = 404;
    throw err;
  }

  domain.branding = domain.branding || {};
  if (typeof input.fromDisplayName === 'string') {
    domain.branding.fromDisplayName = input.fromDisplayName.trim().slice(0, 120);
  }
  if (typeof input.logoUrl === 'string') {
    const url = input.logoUrl.trim();
    if (url && !url.startsWith('https://')) {
      const err = new Error('Logo URL must be a public HTTPS link');
      err.status = 400;
      throw err;
    }
    domain.branding.logoUrl = url;
    if (url) domain.branding.logoStorageKey = '';
  }

  syncBimiDnsRecord(domain);
  await domain.save();
  return domain;
}

/**
 * Issue a presigned upload URL for a domain brand logo.
 * @param {string} tenantId
 * @param {string} domainId
 * @param {string} mimeType
 */
export async function createBrandLogoUploadUrl(tenantId, domainId, mimeType) {
  if (!isR2Configured() || !env.r2.publicUrl) {
    const err = new Error('Logo upload is not configured. Paste a public HTTPS logo URL instead.');
    err.status = 503;
    throw err;
  }
  if (!BRAND_MIME.includes(mimeType)) {
    const err = new Error('Logo must be PNG, JPEG, or SVG');
    err.status = 400;
    throw err;
  }

  const domain = await Domain.findOne({ _id: domainId, tenantId });
  if (!domain) {
    const err = new Error('Domain not found');
    err.status = 404;
    throw err;
  }

  const key = buildBrandLogoKey(tenantId, domainId, mimeType);
  const signed = await presignUpload({ key, mimeType });
  return { ...signed, publicUrl: publicObjectUrl(key) };
}

/**
 * Confirm logo upload in R2 and attach the public URL to the domain.
 * @param {string} tenantId
 * @param {string} domainId
 * @param {string} key
 */
export async function confirmBrandLogoUpload(tenantId, domainId, key) {
  const domain = await Domain.findOne({ _id: domainId, tenantId });
  if (!domain) {
    const err = new Error('Domain not found');
    err.status = 404;
    throw err;
  }
  if (!key?.startsWith(`brand-logos/${tenantId}/${domainId}/`)) {
    const err = new Error('Invalid logo key');
    err.status = 400;
    throw err;
  }

  const meta = await headObject(key);
  if (!BRAND_MIME.includes(meta.contentType)) {
    const err = new Error('Invalid logo file type');
    err.status = 400;
    throw err;
  }
  if (meta.size > MAX_LOGO_BYTES) {
    const err = new Error('Logo must be 512 KB or smaller');
    err.status = 400;
    throw err;
  }

  const publicUrl = publicObjectUrl(key);
  domain.branding = domain.branding || {};
  domain.branding.logoUrl = publicUrl;
  domain.branding.logoStorageKey = key;
  syncBimiDnsRecord(domain);
  await domain.save();

  return { domain, publicUrl, bimiReady: /\.svg(\?|$)/i.test(publicUrl) };
}
