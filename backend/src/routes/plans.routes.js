import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  listPublicPlans,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from '../controllers/plans.controller.js';

const router = Router();

// Public pricing page
router.get('/public', listPublicPlans);

// Super-admin management
router.use(authenticate, authorize('super_admin'));

router.get('/', listPlans);
router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('priceMinor').isInt({ min: 0 }),
    body('monthlyEmailQuota').isInt({ min: 0 }),
  ],
  validate,
  createPlan
);
router.patch('/:id', updatePlan);
router.delete('/:id', deletePlan);

export default router;
