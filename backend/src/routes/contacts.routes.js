import { Router } from 'express';
import { body } from 'express-validator';
import {
  contactStats,
  createContact,
  createContactList,
  deleteContact,
  updateContact,
  deleteContactList,
  exportContacts,
  importContacts,
  listContactLists,
  listContacts,
} from '../controllers/contacts.controller.js';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/stats', contactStats);
router.get('/lists/all', listContactLists);
router.get('/', listContacts);

router.get('/export', requireTenantAdmin, exportContacts);
router.post('/lists', requireTenantAdmin, [body('name').trim().notEmpty()], validate, createContactList);
router.delete('/lists/:id', requireTenantAdmin, deleteContactList);
router.post('/import', requireTenantAdmin, importContacts);
router.post(
  '/',
  requireTenantAdmin,
  [
    body('email').trim().isEmail(),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  validate,
  createContact
);
router.patch('/:id', requireTenantAdmin, updateContact);
router.delete('/:id', requireTenantAdmin, deleteContact);

export default router;
