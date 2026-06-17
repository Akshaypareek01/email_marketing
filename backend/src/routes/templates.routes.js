import { Router } from 'express';
import { body } from 'express-validator';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  previewTemplate,
  duplicateTemplate,
  testSendTemplate,
  listBlockTemplates,
  createFromBlock,
  updateTemplate,
  exportTemplate,
  importTemplate,
} from '../controllers/templates.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/blocks/list', listBlockTemplates);
router.get('/', listTemplates);
router.post(
  '/import',
  requireTenantAdmin,
  [body('name').trim().notEmpty(), body('htmlBody').trim().notEmpty()],
  validate,
  importTemplate
);

router.get('/:id/export', exportTemplate);
router.get('/:id/preview', previewTemplate);
router.get('/:id', getTemplate);

router.post('/blocks/create', requireTenantAdmin, createFromBlock);
router.post('/:id/duplicate', requireTenantAdmin, duplicateTemplate);
router.post('/:id/test-send', requireTenantAdmin, testSendTemplate);
router.post('/', requireTenantAdmin, [body('name').trim().notEmpty()], validate, createTemplate);
router.patch('/:id', requireTenantAdmin, updateTemplate);
router.delete('/:id', requireTenantAdmin, deleteTemplate);

export default router;
