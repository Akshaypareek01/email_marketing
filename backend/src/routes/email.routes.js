import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getMessageAttachment,
  getThreadMessages,
  listEvents,
  listThreads,
  recordReceivedEmail,
  sendOutbound,
  sesWebhook,
} from '../controllers/email.controller.js';
import { inboundWebhook, mailEventsStream, stalwartWebhook } from '../controllers/webhooks.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateQuery } from '../middleware/authQuery.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.post('/webhooks/ses', sesWebhook);
router.post('/webhooks/inbound', inboundWebhook);
router.post('/webhooks/stalwart', stalwartWebhook);

router.get('/events/stream', authenticateQuery, mailEventsStream);

router.use(authenticate);

router.get(
  '/threads',
  [
    query('mailboxId').notEmpty().isMongoId(),
    query('filter').optional().isIn(['all', 'inbox', 'sent']),
  ],
  validate,
  listThreads
);
router.get(
  '/threads/:threadId/messages',
  [param('threadId').isMongoId(), query('mailboxId').optional().isMongoId()],
  validate,
  getThreadMessages
);

router.get(
  '/messages/:messageId/attachments/:index',
  [param('messageId').isMongoId(), param('index').isInt({ min: 0 })],
  validate,
  getMessageAttachment
);

router.post(
  '/inbox',
  [
    body('mailboxId').notEmpty().isMongoId(),
    body('fromAddress').isEmail().normalizeEmail(),
    body('fromName').optional().trim(),
    body('subject').optional().trim(),
    body('textBody').optional().isString(),
    body('htmlBody').optional().isString(),
    body('inReplyTo').optional().trim(),
    body('references').optional(),
    body('inboundMessageId').optional().trim(),
    body('externalMessageId').optional().trim(),
  ],
  validate,
  recordReceivedEmail
);

router.post(
  '/send',
  [
    body('mailboxId').notEmpty(),
    body('to').isEmail(),
    body('subject').trim().notEmpty(),
    body('html').optional().isString(),
    body('text').optional().isString(),
    body('threadId').optional().isMongoId(),
    body('attachments').optional().isArray({ max: 10 }),
    body('attachments.*.filename').optional().trim().notEmpty(),
    body('attachments.*.contentType').optional().trim().notEmpty(),
    body('attachments.*.content').optional().isString().notEmpty(),
  ],
  validate,
  sendOutbound
);

router.get('/events', listEvents);

export default router;
