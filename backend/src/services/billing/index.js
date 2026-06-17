import { BillingProvider } from './BillingProvider.js';
import { StripeBillingProvider } from './StripeBillingProvider.js';
import { RazorpayBillingProvider } from './RazorpayBillingProvider.js';
import { getBillingConfig } from '../platformBillingSettings.service.js';

/**
 * Instantiate a billing provider implementation by name.
 * @param {'stripe' | 'razorpay'} name
 * @returns {BillingProvider}
 */
export function createBillingProvider(name) {
  if (name === 'razorpay') {
    return new RazorpayBillingProvider();
  }
  if (name === 'stripe') {
    return new StripeBillingProvider();
  }
  return new BillingProvider();
}

/**
 * Resolve the active billing provider from platform settings (or env fallback).
 * @returns {Promise<BillingProvider>}
 */
export async function getBillingProvider() {
  const config = await getBillingConfig();
  return createBillingProvider(config.provider);
}

/**
 * Pick webhook handler from signature headers (supports both gateways during migration).
 * @param {string} signatureHeader combined or single signature string
 * @param {import('express').Request['headers']} headers
 * @returns {Promise<BillingProvider>}
 */
export async function getBillingProviderForWebhook(headers, signatureHeader) {
  if (headers['stripe-signature']) {
    return createBillingProvider('stripe');
  }
  if (headers['x-razorpay-signature']) {
    return createBillingProvider('razorpay');
  }

  return getBillingProvider();
}
