/** One-time email quota add-on packs (PRD Phase 4 overage). */
export const QUOTA_ADDON_PACKS = [
  {
    id: 'pack-10k',
    label: '10,000 extra emails',
    emails: 10_000,
    priceMinor: 49_900,
    currency: 'INR',
  },
  {
    id: 'pack-50k',
    label: '50,000 extra emails',
    emails: 50_000,
    priceMinor: 199_900,
    currency: 'INR',
  },
  {
    id: 'pack-100k',
    label: '100,000 extra emails',
    emails: 100_000,
    priceMinor: 349_900,
    currency: 'INR',
  },
];

/**
 * @param {string} packId
 */
export function getQuotaAddonPack(packId) {
  return QUOTA_ADDON_PACKS.find((p) => p.id === packId) || null;
}
