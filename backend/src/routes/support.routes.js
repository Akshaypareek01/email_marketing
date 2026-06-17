import { Router } from 'express';
import { body } from 'express-validator';
import {
  createTicket,
  getTicket,
  listTickets,
  replyTicket,
} from '../controllers/support.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticate);

router.get('/', listTickets);
router.get('/:id', getTicket);
router.post(
  '/',
  [body('subject').trim().notEmpty(), body('message').trim().notEmpty()],
  validate,
  createTicket
);
router.post('/:id/reply', [body('message').trim().notEmpty()], validate, replyTicket);

export default router;
