import axios from 'axios';
import { env } from '../config/env.js';
import logger from '../middleware/logsCreate.js';

const JMAP_USING = ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'];

let cachedJmapApiUrl = null;

/**
 * Resolves the Stalwart JMAP API URL (cached after first lookup).
 */
async function getJmapApiUrl() {
  if (env.stalwart.jmapUrl) return env.stalwart.jmapUrl;
  if (cachedJmapApiUrl) return cachedJmapApiUrl;

  const base = env.stalwart.apiUrl.replace(/\/$/, '');
  const res = await axios.get(`${base}/.well-known/jmap`, { timeout: 10000 });
  cachedJmapApiUrl = res.data?.apiUrl || `${base}/jmap`;
  return cachedJmapApiUrl;
}

/**
 * Admin Basic auth header for Stalwart JMAP management calls.
 */
function adminAuthHeader() {
  const token = Buffer.from(`${env.stalwart.admin}:${env.stalwart.password}`).toString('base64');
  return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Executes JMAP method calls as the Stalwart admin.
 * @param {unknown[][]} methodCalls
 */
async function jmapAdminRequest(methodCalls) {
  const apiUrl = await getJmapApiUrl();
  const res = await axios.post(
    apiUrl,
    { using: JMAP_USING, methodCalls },
    { headers: adminAuthHeader(), timeout: 30000, validateStatus: () => true }
  );

  if (res.status >= 400) {
    throw new Error(`Stalwart JMAP HTTP ${res.status}: ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

/**
 * Finds Stalwart domain id by domain name (e.g. espanda.ai).
 * @param {string} domainName
 */
async function findDomainId(domainName) {
  const data = await jmapAdminRequest([
    ['x:Domain/query', { filter: { text: domainName } }, 'domain-query'],
  ]);

  const response = data?.methodResponses?.[0]?.[1];
  const domainId = response?.ids?.[0];
  if (!domainId) {
    throw new Error(
      `Domain "${domainName}" not found in Stalwart. Add it in Stalwart admin (Directory → Domains) first.`
    );
  }
  return domainId;
}

/**
 * Looks up an existing account id by local part on a domain.
 * @param {string} localPart
 * @param {string} domainId
 */
async function findAccountId(localPart, domainId) {
  const data = await jmapAdminRequest([
    [
      'x:Account/query',
      { filter: { name: localPart, domainId } },
      'account-query',
    ],
  ]);
  return data?.methodResponses?.[0]?.[1]?.ids?.[0] || null;
}

/**
 * Creates a Stalwart user account via JMAP x:Account/set.
 * @param {object} params
 * @param {string} params.address Full email (user@domain.com)
 * @param {string} params.password Plain password (min 8 chars)
 * @param {string} [params.displayName]
 * @param {number} [params.quotaMb]
 */
export async function createStalwartAccountViaJmap({
  address,
  password,
  displayName,
  quotaMb = 1024,
}) {
  const normalized = String(address).toLowerCase().trim();
  const at = normalized.indexOf('@');
  if (at < 1) throw new Error(`Invalid mailbox address: ${address}`);

  const localPart = normalized.slice(0, at);
  const domainName = normalized.slice(at + 1);

  const domainId = await findDomainId(domainName);
  const existingId = await findAccountId(localPart, domainId);

  if (existingId) {
    logger.info({ tag: 'stalwart-jmap', action: 'account-exists', address, accountId: existingId });
    return { principalId: existingId, created: false, linked: true, email: normalized };
  }

  const createKey = `create-${Date.now()}`;
  const data = await jmapAdminRequest([
    [
      'x:Account/set',
      {
        create: {
          [createKey]: {
            '@type': 'User',
            name: localPart,
            domainId,
            description: displayName || `${localPart}@${domainName}`,
            credentials: {
              '0': { '@type': 'Password', secret: password },
            },
            memberGroupIds: {},
            roles: { '@type': 'User' },
            permissions: { '@type': 'Inherit' },
            quotas: { maxDiskQuota: quotaMb * 1024 * 1024 },
            aliases: {},
            encryptionAtRest: { '@type': 'Disabled' },
          },
        },
      },
      'account-create',
    ],
  ]);

  const setResponse = data?.methodResponses?.[0]?.[1];
  const created = setResponse?.created?.[createKey];

  if (created?.id) {
    logger.info({
      tag: 'stalwart-jmap',
      action: 'account-created',
      address: normalized,
      accountId: created.id,
    });
    return { principalId: created.id, created: true, linked: true, email: normalized };
  }

  const notCreated = setResponse?.notCreated?.[createKey];
  if (notCreated) {
    const again = await findAccountId(localPart, domainId);
    if (again) {
      return { principalId: again, created: false, linked: true, email: normalized };
    }
    throw new Error(
      notCreated.description ||
        `Stalwart rejected account creation: ${JSON.stringify(notCreated)}`
    );
  }

  throw new Error('Stalwart account creation returned an unexpected response');
}
