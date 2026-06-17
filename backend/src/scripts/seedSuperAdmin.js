/**
 * Create (or update) the platform super-admin.
 * Usage:
 *   node src/scripts/seedSuperAdmin.js "Akshay" admin@yourdomain.com "StrongPass123"
 * Falls back to env: SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { PlatformSetting } from '../models/PlatformSetting.js';
import { setBillingConfig } from '../services/platformBillingSettings.service.js';

async function run() {
  const [, , argName, argEmail, argPass] = process.argv;
  const name = argName || process.env.SEED_ADMIN_NAME || 'Super Admin';
  const email = (argEmail || process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = argPass || process.env.SEED_ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.error('Provide email and password (args or SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await mongoose.connect(env.mongodbUri);

  let user = await User.findOne({ email }).select('+password');
  if (user) {
    user.role = 'super_admin';
    user.name = name;
    user.password = password; // re-hashed by pre-save hook
    await user.save();
    console.log(`Updated existing user to super_admin: ${email}`);
  } else {
    user = await User.create({ name, email, password, role: 'super_admin' });
    console.log(`Created super_admin: ${email}`);
  }

  const hasBillingConfig = await PlatformSetting.exists({ key: 'billingConfig' });
  if (!hasBillingConfig) {
    await setBillingConfig({ mode: 'provider', provider: 'razorpay' });
    console.log('Default billing gateway: Razorpay (change anytime in Admin → Plans)');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
