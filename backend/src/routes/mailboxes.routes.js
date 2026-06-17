import { Router } from 'express';
import { body } from 'express-validator';
import {
  createMailbox,
  deleteMailbox,
  linkMailboxCredentials,
  listMailboxes,
  syncMailboxInbox,
} from '../controllers/mailboxes.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', listMailboxes);
router.post('/:id/sync-inbox', syncMailboxInbox);
router.post(
  '/',
  requireTenantAdmin,
  [
    body('domainId').notEmpty(),
    body('localPart').trim().notEmpty().matches(/^[a-z0-9._-]+$/i),
    body('displayName').optional().trim(),
    body('password').optional().isLength({ min: 8 }),
    body('quotaMb').optional().isInt({ min: 100 }),
  ],
  validate,
  createMailbox
);
router.post(
  '/:id/credentials',
  requireTenantAdmin,
  [body('password').isLength({ min: 8 })],
  validate,
  linkMailboxCredentials
);
router.delete('/:id', requireTenantAdmin, deleteMailbox);

export default router;
