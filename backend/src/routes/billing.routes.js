import { Router } from 'express';
import {
  createCheckout,
  syncCheckoutStatus,
  listMyTransactions,
  cancelSubscription,
  changePlan,
  getQuotaPacks,
  buyQuotaAddon,
  getBillingConfigPublic,
} from '../controllers/billing.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';

const router = Router();

router.get('/config', getBillingConfigPublic);
router.get('/quota-packs', authenticate, requireTenantAdmin, getQuotaPacks);
router.use(authenticate, requireTenantAdmin);
router.post('/checkout', [body('planId').notEmpty()], validate, createCheckout);
router.post('/sync', syncCheckoutStatus);
router.post('/change-plan', [body('planId').notEmpty()], validate, changePlan);
router.post('/quota-addon', [body('packId').notEmpty()], validate, buyQuotaAddon);
router.post('/cancel', cancelSubscription);
router.get('/transactions', listMyTransactions);

export default router;
