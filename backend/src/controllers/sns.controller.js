import { ingestSesEvent } from '../services/sesEvent.service.js';
import { verifySnsMessageSignature, assertTrustedSnsUrl } from '../services/snsVerify.service.js';
import logger from '../middleware/logsCreate.js';

/**
 * Handle AWS SNS notifications wrapping SES events.
 * Supports SubscriptionConfirmation auto-confirm and Notification delivery.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function snsSesWebhook(req, res) {
  let envelope;
  try {
    envelope = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ message: 'Invalid SNS payload' });
  }

  const snsType = envelope?.Type;

  try {
    await verifySnsMessageSignature(envelope);
  } catch (err) {
    logger.warn({ tag: 'sns-ses', message: 'Signature verification failed', error: err.message });
    return res.status(403).json({ message: 'Invalid SNS signature' });
  }

  if (snsType === 'SubscriptionConfirmation') {
    const url = envelope.SubscribeURL;
    if (url) {
      // Validate host unconditionally (even if signature verification is off) so a
      // forged confirmation can't make the server fetch an arbitrary URL (SSRF).
      try {
        assertTrustedSnsUrl(url, 'SubscribeURL');
      } catch (err) {
        logger.warn({ tag: 'sns-ses', message: 'Rejected untrusted SubscribeURL', error: err.message });
        return res.status(400).json({ message: 'Untrusted SubscribeURL' });
      }
      try {
        await fetch(url);
        logger.info({ tag: 'sns-ses', message: 'Subscription confirmed', topicArn: envelope.TopicArn });
      } catch (err) {
        logger.error({ tag: 'sns-ses', message: 'Subscription confirm failed', error: err.message });
        return res.status(502).json({ message: 'Failed to confirm SNS subscription' });
      }
    }
    return res.status(200).json({ confirmed: true });
  }

  if (snsType === 'UnsubscribeConfirmation') {
    return res.status(200).json({ received: true });
  }

  if (snsType !== 'Notification') {
    return res.status(200).json({ received: true, ignored: snsType || 'unknown' });
  }

  try {
    const sesPayload = JSON.parse(envelope.Message);
    const result = await ingestSesEvent(sesPayload);
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ tag: 'sns-ses', message: err.message });
    return res.status(500).json({ message: 'Failed to process SES event' });
  }
}
