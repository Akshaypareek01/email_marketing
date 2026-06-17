/**
 * Seed default public billing plans (idempotent — upserts by name).
 * Usage: node src/scripts/seedPlans.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Plan } from '../models/Plan.js';

/** @type {Array<Record<string, unknown>>} */
const DEFAULT_PLANS = [
  {
    name: 'Starter',
    description: 'For small teams getting started with email marketing.',
    priceMinor: 99900,
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 10_000,
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
    priceMinor: 299900,
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 50_000,
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
    priceMinor: 799900,
    currency: 'INR',
    interval: 'month',
    monthlyEmailQuota: 200_000,
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
  }

  const count = await Plan.countDocuments({ isPublic: true, isActive: true });
  console.log(`\nDone — ${count} public active plan(s) in database.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
