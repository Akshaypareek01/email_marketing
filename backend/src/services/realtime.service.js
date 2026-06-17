import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(200);

/**
 * Push a mail update to connected dashboards (SSE).
 * @param {object} payload
 * @param {string} payload.tenantId
 * @param {string} [payload.mailboxId]
 * @param {string} [payload.address]
 * @param {string} payload.reason
 */
export function publishMailEvent(payload) {
  bus.emit('mail', payload);
}

/**
 * SSE stream filtered by tenant.
 * @param {import('express').Response} res
 * @param {string} tenantId
 */
export function subscribeMailEvents(res, tenantId) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const onMail = (payload) => {
    if (payload.tenantId && String(payload.tenantId) !== String(tenantId)) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  bus.on('mail', onMail);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    bus.off('mail', onMail);
  });
}
