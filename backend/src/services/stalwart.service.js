import { env } from '../config/env.js';
import { simpleParser } from 'mailparser';
import { createImapClient } from '../config/Stalwart.js';
import { Mailbox } from '../models/Mailbox.js';
import logger from '../middleware/logsCreate.js';
import { decryptSecret } from '../utils/credentials.js';
import { recordInboundCore, shapeInboundFromParsed } from './inboundEmail.service.js';
import { createStalwartAccountViaJmap } from './stalwartJmap.service.js';

/**
 * Legacy fallback: env IMAP_USER/IMAP_PASSWORD for a single dev mailbox.
 * @param {string} address
 * @returns {{ email: string, password: string } | null}
 */
export function getEnvImapCredentials(address) {
  const normalized = String(address).toLowerCase().trim();
  const imapUser = env.imap.user.toLowerCase();
  if (!imapUser || !env.imap.password) return null;
  if (normalized !== imapUser) return null;
  return { email: imapUser, password: env.imap.password };
}

/**
 * IMAP credentials for a mailbox (DB first, then .env fallback).
 * @param {import('../models/Mailbox.js').Mailbox | null} mailbox
 * @returns {{ email: string, password: string } | null}
 */
export function getMailboxImapCredentials(mailbox) {
  if (!mailbox) return null;

  if (mailbox.imapPasswordEnc) {
    try {
      return {
        email: mailbox.address,
        password: decryptSecret(mailbox.imapPasswordEnc),
      };
    } catch (err) {
      logger.error({ tag: 'imap-sync', error: 'Failed to decrypt mailbox IMAP password', address: mailbox.address });
      return null;
    }
  }

  return getEnvImapCredentials(mailbox.address);
}

/**
 * Verifies Stalwart IMAP login for an address/password pair.
 * @param {{ email: string, password: string }} credentials
 */
export async function verifyImapLogin({ email, password }) {
  const client = createImapClient({ user: email, pass: password });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Creates a Stalwart user via JMAP (automatic — no manual Stalwart admin step).
 * @param {{ address: string, password: string, displayName?: string, quotaMb?: number }} params
 */
export async function resolveStalwartAccount({ address, password, displayName, quotaMb = 1024 }) {
  const result = await createStalwartAccountViaJmap({
    address,
    password,
    displayName,
    quotaMb,
  });

  const imapOk = await verifyImapLogin({ email: address, password });
  if (!imapOk) {
    throw new Error(
      `Stalwart account ${result.created ? 'was created' : 'exists'} but IMAP login failed. Check IMAP_HOST and server status.`
    );
  }

  return result;
}

/** @deprecated Legacy REST principal API — use JMAP via resolveStalwartAccount. */
export async function provisionMailbox({ address, password, quotaMb, displayName }) {
  return createStalwartAccountViaJmap({ address, password, quotaMb, displayName });
}

export async function appendToSentFolder({ principalId, rawMessage }) {
  console.log('[Stalwart stub] append sent', { principalId });
  return { success: true };
}

/** Parse raw RFC822; useful for tests or one-off tooling. */
export async function parseEmail(rawSource) {
  const parsed = await simpleParser(rawSource);
  return {
    ...shapeInboundFromParsed(parsed),
    receivedAt: new Date(),
  };
}

/**
 * Import one IMAP folder into MongoDB as inbound messages.
 * @param {import('imapflow').ImapFlow} client
 * @param {string} folderPath
 * @param {import('../models/Mailbox.js').Mailbox} mailboxDoc
 */
async function importImapFolder(client, folderPath, mailboxDoc) {
  const folderStats = {
    folder: folderPath,
    exists: 0,
    processed: 0,
    saved: 0,
    duplicates: 0,
    skipped: 0,
    errors: 0,
  };

  const lock = await client.getMailboxLock(folderPath);
  folderStats.exists = Number(client.mailbox?.exists) || 0;

  try {
    for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
      folderStats.processed += 1;
      try {
        const parsed = await simpleParser(msg.source);
        const shaped = shapeInboundFromParsed(parsed);

        if (!shaped.fromAddress) {
          folderStats.skipped += 1;
          continue;
        }

        const result = await recordInboundCore({
          tenantId: mailboxDoc.tenantId,
          mailbox: mailboxDoc,
          fromAddress: shaped.fromAddress,
          fromName: shaped.fromName,
          subject: shaped.subject,
          textBody: shaped.textBody,
          htmlBody: shaped.htmlBody,
          inReplyTo: shaped.inReplyTo,
          references: shaped.references,
          inboundRfcId: shaped.messageId,
          attachments: shaped.attachments,
        });

        if (result.duplicate) folderStats.duplicates += 1;
        else folderStats.saved += 1;
      } catch (err) {
        folderStats.errors += 1;
        logger.error({ tag: 'imap-sync', folder: folderPath, error: err.message });
      }
    }
  } finally {
    lock.release();
  }

  return folderStats;
}

/**
 * Sync Stalwart/IMAP folders into MongoDB (threads + messages, deduped by Message-ID).
 * @param {{ email: string, password: string }} credentials IMAP login (must match a Mailbox.address)
 */
export async function fetchEmails({ email, password }) {
  const address = String(email).toLowerCase().trim();
  const mailboxDoc = await Mailbox.findOne({ address });
  if (!mailboxDoc) {
    throw new Error(`No mailbox registered for IMAP user ${address}`);
  }

  const client = createImapClient({
    user: email,
    pass: password,
  });

  try {
    await client.connect();
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      throw new Error(
        `Cannot resolve IMAP host "${env.imap.host}" (ENOTFOUND). ` +
          'Fix DNS for that name, or set IMAP_HOST to your real mail server / 127.0.0.1 for local Stalwart.'
      );
    }
    if (err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      throw new Error(
        `IMAP TLS certificate is not trusted (${err.code}). For local Stalwart with a self-signed cert, ` +
          'set IMAP_TLS_INSECURE=true (or 1) in backend/.env — it is loaded from that file next to package.json. ' +
          'Use a CA-trusted cert in production instead.'
      );
    }
    throw err;
  }

  const folders = [];
  const totals = {
    exists: 0,
    processed: 0,
    saved: 0,
    duplicates: 0,
    skipped: 0,
    errors: 0,
  };

  for (const folderPath of env.imap.syncFolders) {
    try {
      const folderStats = await importImapFolder(client, folderPath, mailboxDoc);
      folders.push(folderStats);
      for (const key of Object.keys(totals)) {
        totals[key] += folderStats[key] ?? 0;
      }
    } catch (err) {
      logger.error({ tag: 'imap-sync', folder: folderPath, error: err.message });
      folders.push({
        folder: folderPath,
        exists: 0,
        processed: 0,
        saved: 0,
        duplicates: 0,
        skipped: 0,
        errors: 1,
        error: err.message,
      });
      totals.errors += 1;
    }
  }

  await client.logout();

  logger.info({
    tag: 'imap-sync',
    address,
    folders: env.imap.syncFolders,
    ...totals,
  });

  return { ...totals, folders };
}
