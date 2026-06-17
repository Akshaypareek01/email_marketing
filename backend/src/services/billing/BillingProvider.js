/**
 * Billing provider abstraction (PRD §5.3).
 * Concrete Razorpay/Stripe adapter implements this interface when provider is chosen.
 */
export class BillingProvider {
  /**
   * @param {string} tenantId
   * @param {string} planId
   * @returns {Promise<{ checkoutUrl: string, sessionId: string }>}
   */
  async createCheckoutSession(_tenantId, _planId) {
    throw new Error('Billing provider not configured');
  }

  /**
   * @param {Record<string, unknown>} payload
   * @param {string} signature
   */
  async handleWebhook(_payload, _signature) {
    throw new Error('Billing provider not configured');
  }

  /**
   * @param {string} tenantId
   */
  async cancelSubscription(_tenantId) {
    throw new Error('Billing provider not configured');
  }

  /**
   * @param {string} tenantId
   * @param {string} planId
   * @param {{ direction?: 'upgrade' | 'downgrade' | 'lateral' }} _ctx
   */
  async changeSubscriptionPlan(_tenantId, _planId, _ctx = {}) {
    throw new Error('Billing provider not configured');
  }

  /**
   * @param {string} _tenantId
   * @param {object} _pack
   */
  async createQuotaAddonCheckout(_tenantId, _pack) {
    throw new Error('Billing provider not configured');
  }
}

/** Singleton placeholder until Phase 1a provider is wired. */
export const billingProvider = new BillingProvider();
