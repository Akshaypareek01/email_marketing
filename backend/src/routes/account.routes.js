import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate, requireTenantAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getAccountOverview } from '../controllers/account.controller.js';
import { getAccountAnalytics } from '../controllers/analytics.controller.js';
import { dismissMyNotice, listMyNotices } from '../controllers/notices.controller.js';
import {
  getKycStatus,
  requestUploadUrl,
  confirmUploadHandler,
  submitKyc,
} from '../controllers/kyc.controller.js';

const router = Router();

router.use(authenticate);
router.get('/overview', getAccountOverview);
router.get('/analytics', getAccountAnalytics);
router.get('/notices', listMyNotices);
router.post('/notices/:id/dismiss', dismissMyNotice);

// KYC (business verification) — submission is tenant-admin only.
router.get('/kyc', getKycStatus);
router.post(
  '/kyc/upload-url',
  requireTenantAdmin,
  body('docType').isIn(['pan', 'gst']),
  body('mimeType').isString().notEmpty(),
  body('sizeBytes').isInt({ min: 1 }),
  validate,
  requestUploadUrl
);
router.post(
  '/kyc/confirm',
  requireTenantAdmin,
  body('key').isString().notEmpty(),
  validate,
  confirmUploadHandler
);
router.post(
  '/kyc/submit',
  requireTenantAdmin,
  body('panNumber').isString().notEmpty(),
  validate,
  submitKyc
);

export default router;
