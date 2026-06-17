import crypto from 'crypto';
import { env } from '../config/env.js';
import logger from '../middleware/logsCreate.js';

/** Allowed SNS signing certificate host patterns. */
const CERT_HOST_PATTERN = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;

/**
 * Build the canonical SNS string to sign.
 * @param {Record<string, string>} message
 */
function buildStringToSign(message) {
  const type = message.Type;
  if (type === 'Notification') {
    return [
      'Message', message.Message,
      'MessageId', message.MessageId,
      ...(message.Subject ? ['Subject', message.Subject] : []),
      'Timestamp', message.Timestamp,
      'TopicArn', message.TopicArn,
      'Type', message.Type,
    ].join('\n') + '\n';
  }
  if (type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation') {
    return [
      'Message', message.Message,
      'MessageId', message.MessageId,
      'SubscribeURL', message.SubscribeURL,
      'Timestamp', message.Timestamp,
      'Token', message.Token,
      'TopicArn', message.TopicArn,
      'Type', message.Type,
    ].join('\n') + '\n';
  }
  return '';
}

/**
 * Verify SNS message signature (SignatureVersion 1).
 * @param {Record<string, string>} message
 */
export async function verifySnsMessageSignature(message) {
  if (!env.ses.verifySnsSignature) return true;

  // SignatureVersion 1 = RSA-SHA1 (legacy), 2 = RSA-SHA256 (preferred).
  const algo = { '1': 'RSA-SHA1', '2': 'RSA-SHA256' }[message.SignatureVersion];
  if (!algo) throw new Error('Unsupported SNS signature version');

  // Reject events not from our expected topic when one is configured.
  if (env.ses.snsTopicArn && message.TopicArn && message.TopicArn !== env.ses.snsTopicArn) {
    throw new Error('Unexpected SNS TopicArn');
  }

  assertTrustedSnsUrl(message.SigningCertURL, 'SigningCertURL');

  const certRes = await fetch(message.SigningCertURL);
  if (!certRes.ok) throw new Error('Failed to fetch SNS certificate');
  const certPem = await certRes.text();

  const stringToSign = buildStringToSign(message);
  const verifier = crypto.createVerify(algo);
  verifier.update(stringToSign, 'utf8');
  const valid = verifier.verify(certPem, message.Signature, 'base64');

  if (!valid) throw new Error('Invalid SNS signature');
  logger.debug({ tag: 'sns-verify', messageId: message.MessageId, ok: true });
  return true;
}

/**
 * Validate that an SNS-supplied URL (SigningCertURL / SubscribeURL) is HTTPS and
 * points at an amazonaws.com SNS host. Used to prevent SSRF via crafted URLs.
 * @param {string | undefined} url
 * @param {string} label
 */
export function assertTrustedSnsUrl(url, label = 'URL') {
  if (!url) throw new Error(`Missing ${label}`);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
  if (parsed.protocol !== 'https:' || !CERT_HOST_PATTERN.test(parsed.hostname)) {
    throw new Error(`Untrusted ${label}`);
  }
  return parsed;
}
