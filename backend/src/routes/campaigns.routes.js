import { Router } from 'express';
import { body } from 'express-validator';
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  preflightCampaign,
  scheduleCampaign,
  updateCampaign,
} from '../controllers/campaigns.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', listCampaigns);
router.get('/:id', getCampaign);
router.post('/preflight', preflightCampaign);
router.post(
  '/',
  [
    body('name').trim().notEmpty(),
    body('subject').trim().notEmpty(),
    body('templateId').notEmpty(),
    body('listId').notEmpty(),
  ],
  validate,
  createCampaign
);
router.patch(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('subject').optional().trim().notEmpty(),
    body('templateId').optional().notEmpty(),
    body('listId').optional().notEmpty(),
  ],
  validate,
  updateCampaign
);
router.post('/:id/schedule', scheduleCampaign);
router.delete('/:id', requireTenantAdmin, deleteCampaign);

export default router;
