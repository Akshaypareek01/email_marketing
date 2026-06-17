import { env } from '../config/env.js';
import { PlatformSetting } from '../models/PlatformSetting.js';

const BILLING_CONFIG_KEY = 'billingConfig';

/** @typedef {'direct' | 'provider'} BillingMode */
/** @typedef {'stripe' | 'razorpay'} BillingProviderName */

/**
 * Normalize billing mode from stored value or env.
 * @param {unknown} value
 * @returns {BillingMode}
 */
function normalizeMode(value) {
  return value === 'provider' ? 'provider' : 'direct';
}

/**
 * Normalize payment gateway id.
 * @param {unknown} value
 * @returns {BillingProviderName}
 */
function normalizeProvider(value) {
  return value === 'stripe' ? 'stripe' : 'razorpay';
}

/**
 * Active billing configuration — DB overrides env when set by super admin.
 * @returns {Promise<{ mode: BillingMode; provider: BillingProviderName; source: 'platform' | 'env' }>}
 */
export async function getBillingConfig() {
  const row = await PlatformSetting.findOne({ key: BILLING_CONFIG_KEY }).lean();
  if (row?.value && typeof row.value === 'object') {
    const v = row.value;
    return {
      mode: normalizeMode(v.mode),
      provider: normalizeProvider(v.provider),
      source: 'platform',
    };
  }

  return {
    mode: normalizeMode(env.billing.mode),
    provider: normalizeProvider(env.billing.provider),
    source: 'env',
  };
}

/**
 * Whether paid checkout flows through a payment gateway.
 * @returns {Promise<boolean>}
 */
export async function isBillingProviderEnabled() {
  const config = await getBillingConfig();
  return config.mode === 'provider';
}

/**
 * Persist platform billing mode + gateway (super admin).
 * @param {{ mode?: BillingMode; provider?: BillingProviderName }} input
 */
export async function setBillingConfig(input) {
  const current = await getBillingConfig();
  const next = {
    mode: input.mode != null ? normalizeMode(input.mode) : current.mode,
    provider: input.provider != null ? normalizeProvider(input.provider) : current.provider,
  };

  await PlatformSetting.findOneAndUpdate(
    { key: BILLING_CONFIG_KEY },
    { $set: { value: next } },
    { upsert: true, new: true }
  );

  return { ...next, source: 'platform' };
}

/**
 * Public-safe billing flags for tenant UI (no secrets).
 * @returns {Promise<{ mode: BillingMode; provider: BillingProviderName; paymentsEnabled: boolean }>}
 */
export async function getPublicBillingConfig() {
  const config = await getBillingConfig();
  return {
    mode: config.mode,
    provider: config.provider,
    paymentsEnabled: config.mode === 'provider',
  };
}
