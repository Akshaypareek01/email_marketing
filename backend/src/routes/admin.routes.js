import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getOverview,
  listTenants,
  getTenant,
  setTenantStatus,
  setTenantSending,
  adjustTenantQuota,
} from '../controllers/admin.controller.js';
import {
  adminGetTicket,
  adminListTickets,
  adminReplyTicket,
  adminSetTicketStatus,
  adminAssignTicket,
} from '../controllers/adminSupport.controller.js';
import {
  adminDeleteSuppression,
  adminListSuppressions,
} from '../controllers/adminSuppressions.controller.js';
import { adminListTransactions, adminRefundTransactionHandler } from '../controllers/adminTransactions.controller.js';
import { adminListAuditLogs } from '../controllers/adminAudit.controller.js';
import {
  adminCreateTenantNotice,
} from '../controllers/adminNotices.controller.js';
import {
  impersonateTenant,
  adminAnalytics,
  adminRevenue,
  adminPlanDistribution,
  adminTopCustomers,
  syncSuppressions,
  listCannedResponses,
} from '../controllers/adminExtras.controller.js';
import { getPlatformSettings, setPlatformHalt, setPlatformDailyLimitHandler, getReputationRisk, runReputationGuard } from '../controllers/adminPlatform.controller.js';
import {
  getAdminBillingSettings,
  patchAdminBillingSettings,
} from '../controllers/adminBilling.controller.js';
import {
  listKycQueue,
  getKycDetail,
  viewKycDocument,
  decideKyc,
} from '../controllers/adminKyc.controller.js';

const router = Router();

// Every admin route requires a platform super-admin.
router.use(authenticate, authorize('super_admin'));

router.get('/overview', getOverview);
router.get('/analytics', adminAnalytics);
router.get('/analytics/revenue', adminRevenue);
router.get('/analytics/plans', adminPlanDistribution);
router.get('/customers/top', adminTopCustomers);
router.get('/support/canned', listCannedResponses);
router.post('/suppressions/sync', syncSuppressions);
router.get('/tenants', listTenants);
router.get('/tenants/:id', getTenant);
router.patch('/tenants/:id/status', setTenantStatus);
router.patch('/tenants/:id/sending', setTenantSending);
router.patch('/tenants/:id/quota', adjustTenantQuota);
router.post('/tenants/:id/notices', adminCreateTenantNotice);
router.post('/tenants/:id/impersonate', impersonateTenant);

router.get('/support', adminListTickets);
router.get('/support/:id', adminGetTicket);
router.post('/support/:id/reply', adminReplyTicket);
router.patch('/support/:id/status', adminSetTicketStatus);
router.patch('/support/:id/assign', adminAssignTicket);

router.get('/suppressions', adminListSuppressions);
router.delete('/suppressions/:id', adminDeleteSuppression);

router.get('/transactions', adminListTransactions);
router.post('/transactions/:id/refund', adminRefundTransactionHandler);

router.get('/audit', adminListAuditLogs);

router.get('/platform', getPlatformSettings);
router.patch('/platform/halt', setPlatformHalt);
router.patch('/platform/daily-limit', setPlatformDailyLimitHandler);
router.get('/billing/settings', getAdminBillingSettings);
router.patch('/billing/settings', patchAdminBillingSettings);
router.get('/reputation/risk', getReputationRisk);
router.post('/reputation/evaluate', runReputationGuard);

// KYC review queue (business verification).
router.get('/kyc', listKycQueue);
router.get('/kyc/:id', getKycDetail);
router.get('/kyc/:id/documents/:docId/view', viewKycDocument);
router.patch('/kyc/:id/decision', decideKyc);

export default router;
