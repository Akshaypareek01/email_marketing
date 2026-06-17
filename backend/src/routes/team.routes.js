import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listTeamUsers, inviteUser, removeTeamUser } from '../controllers/team.controller.js';

const router = Router();

router.use(authenticate, requireTenantAdmin);

router.get('/users', listTeamUsers);
router.post(
  '/invite',
  [
    body('email').isEmail().normalizeEmail(),
    body('name').trim().notEmpty(),
    body('role').optional().isIn(['user', 'admin']),
  ],
  validate,
  inviteUser
);
router.delete('/users/:id', removeTeamUser);

export default router;
