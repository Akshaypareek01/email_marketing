/**
 * Seed the 3 public billing plans, engineered for high gross margin on EVERY user.
 *
 * Idempotent — upserts by plan name, so re-running just re-tunes the existing
 * plans (no duplicates, no orphaned subscriptions).
 *
 * Usage: npm run seed:plans   (or: node src/scripts/seedPlans.js)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Plan } from '../models/Plan.js';

/* -------------------------------------------------------------------------- */
/* Cost model                                                                 */
/*                                                                            */
/* Outbound email is the only meaningful variable cost. We use the same SES   */
/* assumption the admin dashboard uses ($0.10 / 1,000 emails) plus a flat     */
/* per-user infra/support buffer. Prices below are set so the gross margin    */
/* holds even when a user burns their ENTIRE monthly quota — i.e. we stay     */
/* highly profitable on every single user, not just light ones.               */
/* -------------------------------------------------------------------------- */
const SES_COST_PER_1000_USD = 0.1; // matches admin.controller.js
const USD_TO_INR = 85; // approximate FX — tune to your accounting rate
const INFRA_BUFFER_INR = 75; // per-user monthly overhead (storage, support, infra)

/** Worst-case monthly cost to serve one user at full quota, in minor units (paise). */
function costMinorAtFullQuota(monthlyEmailQuota) {
  const emailCostInr = (monthlyEmailQuota / 1000) * SES_COST_PER_1000_USD * USD_TO_INR;
  return Math.round((emailCostInr + INFRA_BUFFER_INR) * 100);
}

/** Gross margin % at full quota, given a plan price (minor units). */
function marginPct(priceMinor, monthlyEmailQuota) {
  return Math.round((1 - costMinorAtFullQuota(monthlyEmailQuota) / priceMinor) * 100);
}

/** @type {Array<Record<string, unknown>>} */
const DEFAULT_PLANS = [
  {
    name: 'Starter',
    description: 'For small teams getting started with email marketing.',
    priceMinor: 99900, // ₹999/mo — worst-case cost ≈ ₹143 → ~86% margin
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 8_000,
    maxContacts: 5_000,
    maxDomains: 1,
    maxTeamUsers: 2,
    attachmentMb: 10,
    features: ['Campaigns', 'Templates', 'Analytics', 'Support tickets'],
    isActive: true,
    isPublic: true,
    sortOrder: 1,
  },
  {
    name: 'Growth',
    description: 'Higher volume sends with more contacts and team seats.',
    priceMinor: 299900, // ₹2,999/mo — worst-case cost ≈ ₹373 → ~88% margin
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 35_000,
    maxContacts: 25_000,
    maxDomains: 3,
    maxTeamUsers: 5,
    attachmentMb: 15,
    features: ['Everything in Starter', 'Priority support', 'Team invites'],
    isActive: true,
    isPublic: true,
    sortOrder: 2,
  },
  {
    name: 'Pro',
    description: 'For agencies and high-volume senders.',
    priceMinor: 799900, // ₹7,999/mo — worst-case cost ≈ ₹1,095 → ~86% margin
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 120_000,
    maxContacts: 100_000,
    maxDomains: 10,
    maxTeamUsers: 15,
    attachmentMb: 25,
    features: ['Everything in Growth', 'Higher quotas', 'Dedicated onboarding'],
    isActive: true,
    isPublic: true,
    sortOrder: 3,
  },
];

async function run() {
  await mongoose.connect(env.mongodbUri);

  console.log('Seeding plans (price → worst-case cost @ full quota → gross margin):\n');

  for (const plan of DEFAULT_PLANS) {
    const existing = await Plan.findOne({ name: plan.name });
    if (existing) {
      Object.assign(existing, plan);
      await existing.save();
      console.log(`Updated plan: ${plan.name}`);
    } else {
      await Plan.create(plan);
      console.log(`Created plan: ${plan.name}`);
    }

    const cost = costMinorAtFullQuota(plan.monthlyEmailQuota);
    console.log(
      `  ₹${(plan.priceMinor / 100).toLocaleString('en-IN')}/mo` +
        ` · ${plan.monthlyEmailQuota.toLocaleString('en-IN')} emails` +
        ` · cost ≈ ₹${(cost / 100).toFixed(0)}` +
        ` · margin ${marginPct(plan.priceMinor, plan.monthlyEmailQuota)}%\n`
    );
  }

  const count = await Plan.countDocuments({ isPublic: true, isActive: true });
  console.log(`Done — ${count} public active plan(s) in database.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
