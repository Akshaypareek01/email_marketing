import { Router } from 'express';
import { body } from 'express-validator';
import {
  createDomain,
  deleteDomain,
  getDomain,
  listDomains,
  verifyDomain,
} from '../controllers/domains.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', listDomains);
router.get('/:id', getDomain);
router.post('/', requireTenantAdmin, [body('name').trim().notEmpty().isFQDN()], validate, createDomain);
router.post('/:id/verify', requireTenantAdmin, verifyDomain);
router.delete('/:id', requireTenantAdmin, deleteDomain);

export default router;
