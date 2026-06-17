import { env } from '../config/env.js';
import logger from '../middleware/logsCreate.js';
import {
  handleSimpleInboundWebhook,
  handleStalwartWebhookBatch,
} from '../services/inboundWebhook.service.js';
import { subscribeMailEvents } from '../services/realtime.service.js';

/**
 * Validates Stalwart / custom inbound webhook auth.
 * @param {import('express').Request} req
 */
function assertWebhookAuth(req) {
  if (!env.inboundWebhookSecret) {
    const err = new Error('Inbound webhook is not configured (set INBOUND_WEBHOOK_SECRET)');
    err.status = 503;
    throw err;
  }

  const headerSecret = req.headers['x-inbound-webhook-secret'];
  if (headerSecret === env.inboundWebhookSecret) return;

  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && auth.slice(7) === env.inboundWebhookSecret) return;

  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const password = decoded.split(':').slice(1).join(':');
    if (password === env.inboundWebhookSecret) return;
  }

  const err = new Error('Invalid webhook secret');
  err.status = 401;
  throw err;
}

/**
 * Stalwart telemetry webhook OR simple { to, from, ... } payload.
 */
export async function inboundWebhook(req, res, next) {
  try {
    assertWebhookAuth(req);

    if (Array.isArray(req.body?.events)) {
      const result = await handleStalwartWebhookBatch(req.body);
      return res.status(200).json({ received: true, mode: 'stalwart-events', ...result });
    }

    const result = await handleSimpleInboundWebhook(req.body);
    if (result.duplicate) {
      return res.status(200).json({ received: true, duplicate: true });
    }
    return res.status(201).json({
      received: true,
      mode: 'simple',
      id: result.message._id,
      threadId: result.thread._id,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

/** Alias route for Stalwart WebUI configuration. */
export async function stalwartWebhook(req, res, next) {
  return inboundWebhook(req, res, next);
}

/**
 * SSE: live mail updates for the logged-in tenant.
 */
export function mailEventsStream(req, res) {
  subscribeMailEvents(res, req.user.tenantId);
  logger.info({ tag: 'sse', action: 'connected', tenantId: String(req.user.tenantId) });
}
