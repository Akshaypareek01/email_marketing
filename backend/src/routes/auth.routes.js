import { Router } from 'express';
import { body } from 'express-validator';
import {
  login,
  me,
  register,
  refresh,
  logout,
  forgotPassword,
  resetPasswordHandler,
  resendVerification,
  verifyEmail,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authRateLimit, accountRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post(
  '/register',
  authRateLimit,
  [
    body('name').trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('tenantName').trim().notEmpty(),
  ],
  validate,
  register
);

router.post(
  '/login',
  authRateLimit,
  accountRateLimit,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  login
);

router.post(
  '/refresh',
  authRateLimit,
  [body('refreshToken').notEmpty()],
  validate,
  refresh
);

router.post('/logout', logout);

router.post(
  '/forgot-password',
  authRateLimit,
  accountRateLimit,
  [body('email').isEmail().normalizeEmail()],
  validate,
  forgotPassword
);

router.post(
  '/reset-password',
  authRateLimit,
  [body('token').notEmpty(), body('password').isLength({ min: 8 })],
  validate,
  resetPasswordHandler
);

router.post('/verify-email', authRateLimit, [body('token').notEmpty()], validate, verifyEmail);

router.post('/resend-verification', authenticate, resendVerification);

router.get('/me', authenticate, me);

export default router;
