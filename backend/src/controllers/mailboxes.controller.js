import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { Domain } from '../models/Domain.js';
import { Mailbox } from '../models/Mailbox.js';
import logger from '../middleware/logsCreate.js';
import { encryptSecret } from '../utils/credentials.js';
import { publishMailEvent } from '../services/realtime.service.js';
import {
  fetchEmails,
  getMailboxImapCredentials,
  resolveStalwartAccount,
  verifyImapLogin,
} from '../services/stalwart.service.js';

export async function listMailboxes(req, res, next) {
  try {
    const filter = { tenantId: req.user.tenantId };
    if (req.query.domainId) filter.domainId = req.query.domainId;

    const mailboxes = await Mailbox.find(filter)
      .populate('domainId', 'name status')
      .sort({ createdAt: -1 });

    res.json({ mailboxes, inboundEmailEnabled: env.inboundEmailEnabled });
  } catch (err) {
    next(err);
  }
}

export async function createMailbox(req, res, next) {
  try {
    const { domainId, localPart, displayName, password, quotaMb } = req.body;

    const domain = await Domain.findOne({ _id: domainId, tenantId: req.user.tenantId });
    if (!domain) return res.status(404).json({ message: 'Domain not found' });
    if (domain.status !== 'active') {
      return res.status(400).json({ message: 'Domain must be active before creating mailboxes' });
    }

    const address = `${localPart}@${domain.name}`;
    const existing = await Mailbox.findOne({ tenantId: req.user.tenantId, address });
    if (existing) {
      return res.status(409).json({ message: 'Mailbox already exists' });
    }

    let stalwart = { principalId: '', linked: false, created: false };
    let plainPassword = '';
    let passwordHash;
    let imapPasswordEnc;

    if (env.inboundEmailEnabled) {
      // --- Stalwart / inbound (disabled when INBOUND_EMAIL_ENABLED=false) ---
      plainPassword = password || cryptoRandomPassword();
      stalwart = await resolveStalwartAccount({
        address,
        password: plainPassword,
        displayName,
        quotaMb: quotaMb || 1024,
      });
      passwordHash = await bcrypt.hash(plainPassword, 12);
      imapPasswordEnc = encryptSecret(plainPassword);
    }

    const mailbox = await Mailbox.create({
      tenantId: req.user.tenantId,
      domainId: domain._id,
      address,
      displayName,
      ...(passwordHash ? { passwordHash } : {}),
      ...(imapPasswordEnc ? { imapPasswordEnc } : {}),
      stalwartPrincipalId: stalwart.principalId || undefined,
      stalwartLinked: stalwart.linked,
      quotaMb: quotaMb || 1024,
    });

    logger.info({
      tag: 'mailbox',
      action: 'created',
      address,
      outboundOnly: !env.inboundEmailEnabled,
      stalwartLinked: stalwart.linked,
      stalwartCreated: stalwart.created,
    });

    if (env.inboundEmailEnabled) {
      const mailboxWithSecrets = await Mailbox.findById(mailbox._id).select('+imapPasswordEnc');
      const credentials = getMailboxImapCredentials(mailboxWithSecrets);
      if (credentials) {
        try {
          await fetchEmails(credentials);
        } catch (syncErr) {
          logger.warn({ tag: 'mailbox', action: 'initial-sync-failed', address, error: syncErr.message });
        }
      }
    }

    res.status(201).json({
      mailbox: {
        id: mailbox._id,
        address: mailbox.address,
        displayName: mailbox.displayName,
        domainId: mailbox.domainId,
        quotaMb: mailbox.quotaMb,
        status: mailbox.status,
        stalwartPrincipalId: mailbox.stalwartPrincipalId,
        stalwartLinked: mailbox.stalwartLinked,
      },
      ...(env.inboundEmailEnabled && plainPassword
        ? { credentials: { address, password: plainPassword } }
        : {}),
      ...(env.inboundEmailEnabled ? { stalwart: { linked: stalwart.linked, created: stalwart.created } } : {}),
      outboundOnly: !env.inboundEmailEnabled,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Link IMAP credentials for an existing Stalwart mailbox (inbound mode only).
 */
export async function linkMailboxCredentials(req, res, next) {
  try {
    if (!env.inboundEmailEnabled) {
      return res.status(400).json({
        message: 'Inbound email is disabled. Sender addresses work for outbound SES sending only.',
      });
    }

    const { password } = req.body;
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: 'password is required (min 8 characters)' });
    }

    const mailbox = await Mailbox.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!mailbox) return res.status(404).json({ message: 'Mailbox not found' });

    const imapOk = await verifyImapLogin({ email: mailbox.address, password });
    if (!imapOk) {
      return res.status(400).json({
        message: 'IMAP login failed for this address. Use the same password as in Stalwart.',
      });
    }

    mailbox.imapPasswordEnc = encryptSecret(password);
    mailbox.passwordHash = await bcrypt.hash(password, 12);
    mailbox.stalwartPrincipalId = mailbox.stalwartPrincipalId || mailbox.address;
    mailbox.stalwartLinked = true;
    await mailbox.save();

    logger.info({ tag: 'mailbox', action: 'credentials-linked', address: mailbox.address });

    res.json({
      mailbox: {
        id: mailbox._id,
        address: mailbox.address,
        stalwartLinked: mailbox.stalwartLinked,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Pull new messages from Stalwart IMAP into MongoDB (inbound mode only).
 */
export async function syncMailboxInbox(req, res, next) {
  try {
    if (!env.inboundEmailEnabled) {
      return res.status(400).json({
        message: 'Inbound email sync is disabled on this platform.',
      });
    }

    const mailbox = await Mailbox.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).select('+imapPasswordEnc');
    if (!mailbox) {
      return res.status(404).json({ message: 'Mailbox not found' });
    }

    const credentials = getMailboxImapCredentials(mailbox);
    if (!credentials) {
      return res.status(400).json({
        message:
          'No IMAP credentials stored for this mailbox. Link Stalwart credentials from the Mailboxes page.',
      });
    }

    logger.info({
      tag: 'imap-sync',
      action: 'start',
      mailboxId: String(mailbox._id),
      address: mailbox.address,
    });

    const stats = await fetchEmails(credentials);

    logger.info({
      tag: 'imap-sync',
      action: 'complete',
      mailboxId: String(mailbox._id),
      address: mailbox.address,
      stats,
    });

    publishMailEvent({
      tenantId: String(req.user.tenantId),
      mailboxId: String(mailbox._id),
      address: mailbox.address,
      reason: 'manual-sync',
      stats,
    });

    res.json({ mailboxId: mailbox._id, address: mailbox.address, stats });
  } catch (err) {
    next(err);
  }
}

export async function deleteMailbox(req, res, next) {
  try {
    const mailbox = await Mailbox.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    });
    if (!mailbox) return res.status(404).json({ message: 'Mailbox not found' });
    res.json({ message: 'Mailbox removed' });
  } catch (err) {
    next(err);
  }
}

/**
 * Generates a random password for Stalwart IMAP accounts.
 * @returns {string}
 */
function cryptoRandomPassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
