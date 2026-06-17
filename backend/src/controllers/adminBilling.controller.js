import {
  getBillingConfig,
  setBillingConfig,
} from '../services/platformBillingSettings.service.js';
import { env } from '../config/env.js';
import { writeAuditLog, auditContext } from '../services/audit.service.js';

/**
 * Super admin: read platform billing mode + active payment gateway.
 */
export async function getAdminBillingSettings(req, res, next) {
  try {
    const config = await getBillingConfig();
    res.json({
      billing: config,
      credentials: {
        stripeConfigured: Boolean(env.billing.stripe.secretKey),
        razorpayConfigured: Boolean(env.billing.razorpay.keyId && env.billing.razorpay.keySecret),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Super admin: set billing mode and payment gateway for the platform.
 */
export async function patchAdminBillingSettings(req, res, next) {
  try {
    const { mode, provider } = req.body;
    if (mode != null && !['direct', 'provider'].includes(mode)) {
      return res.status(400).json({ message: 'mode must be direct or provider' });
    }
    if (provider != null && !['stripe', 'razorpay'].includes(provider)) {
      return res.status(400).json({ message: 'provider must be stripe or razorpay' });
    }

    const billing = await setBillingConfig({ mode, provider });

    await writeAuditLog({
      ...auditContext(req),
      action: 'admin.billing_settings',
      metadata: { mode: billing.mode, provider: billing.provider },
    });

    res.json({
      billing,
      credentials: {
        stripeConfigured: Boolean(env.billing.stripe.secretKey),
        razorpayConfigured: Boolean(env.billing.razorpay.keyId && env.billing.razorpay.keySecret),
      },
    });
  } catch (err) {
    next(err);
  }
}
