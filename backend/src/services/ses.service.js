import crypto from 'crypto';
import { env } from '../config/env.js';
import { stripAngleBrackets } from './threading.service.js';
import {
  CreateEmailIdentityCommand,
  GetAccountCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand,
  SESv2Client,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({
  region: env.aws.region,
  credentials: env.aws.accessKeyId
    ? {
        accessKeyId: env.aws.accessKeyId,
        secretAccessKey: env.aws.secretAccessKey,
      }
    : undefined,
});

/**
 * Normalizes CreateEmailIdentity / GetEmailIdentity responses.
 * @param {import('@aws-sdk/client-sesv2').CreateEmailIdentityCommandOutput | import('@aws-sdk/client-sesv2').GetEmailIdentityCommandOutput} response
 * @param {string} domainName
 */
function mapSesIdentityResponse(response, domainName) {
  return {
    identityArn: response.IdentityArn || response.IdentityType || domainName,
    verifiedForSending: Boolean(response.VerifiedForSendingStatus),
    dkimTokens: response.DkimAttributes?.Tokens || [],
    dkimStatus: response.DkimAttributes?.Status || 'PENDING',
  };
}

/**
 * Creates a SES domain identity, or loads an existing one if already registered.
 * @param {string} domainName
 */
export async function resolveSesIdentity(domainName) {
  try {
    const command = new CreateEmailIdentityCommand({
      EmailIdentity: domainName,
      DkimSigningAttributes: {
        NextSigningKeyLength: 'RSA_2048_BIT',
      },
    });

    const response = await ses.send(command);
    return mapSesIdentityResponse(response, domainName);
  } catch (err) {
    if (err.name !== 'AlreadyExistsException') {
      throw err;
    }

    const existing = await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: domainName })
    );
    return mapSesIdentityResponse(existing, domainName);
  }
}

/** @deprecated Use resolveSesIdentity — kept for callers that only create. */
export async function createSesIdentity(domainName) {
  return resolveSesIdentity(domainName);
}


export async function getSesIdentityStatus(
  domainName
) {
  const command = new GetEmailIdentityCommand({
    EmailIdentity: domainName,
  });

  const result = await ses.send(command);

  return {
    domainName,
    verifiedForSending: Boolean(result.VerifiedForSendingStatus),
    dkimStatus: result.DkimAttributes?.Status || 'PENDING',
    dkimTokens: result.DkimAttributes?.Tokens || [],
    mailFromStatus: result.MailFromAttributes?.MailFromDomainStatus || 'NOT_STARTED',
  };
}

/**
 * Fetch AWS SES account-level sending quota and status (GetAccount).
 * Returns null if AWS credentials are not configured.
 */
export async function getSesAccount() {
  if (!env.aws.accessKeyId) return null;
  const result = await ses.send(new GetAccountCommand({}));
  return {
    max24HourSend: result.SendQuota?.Max24HourSend ?? null,
    maxSendRate: result.SendQuota?.MaxSendRate ?? null,
    sentLast24Hours: result.SendQuota?.SentLast24Hours ?? null,
    productionAccessEnabled: Boolean(result.ProductionAccessEnabled),
    sendingEnabled: Boolean(result.SendingEnabled),
    enforcementStatus: result.EnforcementStatus || null,
  };
}

/**
 * Configure custom MAIL FROM domain in SES (PRD §5.2 / §6.1).
 * @param {string} domainName
 * @param {string} mailFromDomain e.g. mail.example.com
 */
export async function configureSesMailFrom(domainName, mailFromDomain) {
  await ses.send(
    new PutEmailIdentityMailFromAttributesCommand({
      EmailIdentity: domainName,
      MailFromDomain: mailFromDomain,
      BehaviorOnMxFailure: 'USE_DEFAULT_VALUE',
    })
  );
  return { mailFromDomain, configured: true };
}

/**
 * @param {object} opts
 * @param {string} [opts.rfcMessageId] - full Message-ID header value (may include angle brackets)
 */
// export async function sendEmail({ from, to, subject, html, text, rfcMessageId }) {
//   const sesMessageId = `ses-stub-${crypto.randomUUID()}`;
//   const rfc = stripAngleBrackets(rfcMessageId) || `${crypto.randomUUID()}@${from.split('@')[1] || 'localhost'}`;
//   console.log('[SES stub] send', { from, to, subject, sesMessageId, rfcMessageId: rfc });

//   return {
//     messageId: sesMessageId,
//     rfcMessageId: rfc,
//     provider: 'aws-ses-stub',
//   };
// }






// function stripAngleBrackets(value = '') {
//   return value.replace(/[<>]/g, '');
// }

/**
 * @param {object[]} [attachments]
 * @param {string} attachments[].filename
 * @param {string} attachments[].contentType
 * @param {string} attachments[].content - base64-encoded file bytes
 */
export async function sendEmail({
  from,
  to,
  subject,
  html,
  text,
  rfcMessageId,
  attachments = [],
  tenantId,
  campaignId,
  listUnsubscribe,
  configurationSetName,
}) {
  const body = {};
  if (html) body.Html = { Data: html };
  if (text) body.Text = { Data: text };
  if (!html && !text) {
    body.Text = { Data: ' ' };
  }

  const sesAttachments = attachments.map((file) => ({
    FileName: file.filename,
    ContentType: file.contentType,
    RawContent: Buffer.from(file.content, 'base64'),
    ContentDisposition: 'ATTACHMENT',
    ContentTransferEncoding: 'BASE64',
  }));

  const headers = [];
  if (listUnsubscribe) {
    headers.push({ Name: 'List-Unsubscribe', Value: `<${listUnsubscribe}>` });
    headers.push({ Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' });
  }

  const emailTags = [];
  if (rfcMessageId) {
    emailTags.push({ Name: 'message-id', Value: String(rfcMessageId).slice(0, 256) });
  }
  if (tenantId) {
    emailTags.push({ Name: 'tenantId', Value: String(tenantId).slice(0, 256) });
  }
  if (campaignId) {
    emailTags.push({ Name: 'campaignId', Value: String(campaignId).slice(0, 256) });
  }

  const command = new SendEmailCommand({
    FromEmailAddress: from,

    Destination: {
      ToAddresses: Array.isArray(to)
        ? to
        : [to],
    },

    Content: {
      Simple: {
        Subject: {
          Data: subject || '(no subject)',
        },

        Body: body,

        ...(sesAttachments.length ? { Attachments: sesAttachments } : {}),
        ...(headers.length ? { Headers: headers } : {}),
      },
    },

    ...(emailTags.length ? { EmailTags: emailTags } : {}),
    ...(configurationSetName ? { ConfigurationSetName: configurationSetName } : {}),
  });

  const response = await ses.send(command);

  return {
    messageId: response.MessageId,
    rfcMessageId,
    provider: 'aws-ses',
  };
}
