'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button, Card, CardBody, CardHeader, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { Domain } from '@/lib/types';

interface DomainBrandingCardProps {
  domain: Domain;
  admin: boolean;
  onUpdated: () => void;
}

/**
 * Sender display name + logo upload for Gmail BIMI and inbox branding.
 */
export function DomainBrandingCard({ domain, admin, onUpdated }: DomainBrandingCardProps) {
  const [fromDisplayName, setFromDisplayName] = useState(domain.branding?.fromDisplayName || '');
  const [logoUrl, setLogoUrl] = useState(domain.branding?.logoUrl || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const bimiRecord = domain.dnsRecords?.find((r) => r.purpose === 'bimi');
  const isSvg = /\.svg(\?|$)/i.test(logoUrl);

  useEffect(() => {
    setFromDisplayName(domain.branding?.fromDisplayName || '');
    setLogoUrl(domain.branding?.logoUrl || '');
  }, [domain._id, domain.branding?.fromDisplayName, domain.branding?.logoUrl]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.updateDomainBranding(token, domain._id, { fromDisplayName, logoUrl });
      setNotice('Sender branding saved. Re-run DNS verification if a BIMI record was added.');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save branding');
    } finally {
      setSaving(false);
    }
  }

  async function onUploadLogo(file: File) {
    const token = getToken();
    if (!token) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const { uploadUrl, key, publicUrl } = await api.domainLogoUploadUrl(token, domain._id, file.type);
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      const res = await api.confirmDomainLogo(token, domain._id, key);
      setLogoUrl(res.publicUrl || publicUrl);
      setNotice(
        res.bimiReady
          ? 'Logo uploaded. Add the BIMI DNS record below and verify — Gmail may show it in the inbox.'
          : 'Logo uploaded. Use an SVG for Gmail inbox avatar (BIMI); PNG works inside email templates.'
      );
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Logo upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title="Sender branding"
        subtitle="Company name in the inbox + logo for Gmail (BIMI)"
      />
      <CardBody>
        <p className="mb-4 text-sm text-muted-foreground">
          The round image in Gmail is <strong>not</strong> uploaded like a social profile — Gmail uses{' '}
          <strong>BIMI</strong> (SVG logo + DMARC). We also send a friendly <strong>From name</strong>{' '}
          so recipients see your brand instead of a bare email address.
        </p>

        {admin ? (
          <form onSubmit={onSave} className="space-y-4">
            <Input
              label="From display name"
              value={fromDisplayName}
              onChange={(e) => setFromDisplayName(e.target.value)}
              placeholder="e.g. NVHO Tech"
              hint="Shown as the sender name in Gmail/Outlook"
            />
            <Input
              label="Logo URL (HTTPS)"
              value={logoUrl.startsWith('data:') ? '' : logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://yoursite.com/logo.svg"
              hint="SVG for Gmail avatar · PNG/JPG for email template logo block"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium">Or upload logo</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUploadLogo(file);
                  e.target.value = '';
                }}
              />
            </div>
            {logoUrl && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="" className="h-12 w-12 rounded-full border object-cover" />
                <div className="text-sm">
                  <p className="font-medium">{fromDisplayName || domain.name}</p>
                  <p className="text-muted-foreground">Preview (in-email logo)</p>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}
            <Button type="submit" loading={saving}>
              Save branding
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Contact an admin to update sender branding.</p>
        )}

        {bimiRecord && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            BIMI DNS record is listed below — publish it at your DNS host, then run verification.
            DMARC must be <code>p=quarantine</code> or <code>p=reject</code> for Gmail to show the logo.
          </p>
        )}
        {logoUrl && !isSvg && (
          <p className="mt-2 text-xs text-muted-foreground">
            Current logo is not SVG — upload an SVG version for Gmail inbox avatar support.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
