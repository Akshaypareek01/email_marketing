import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';

/**
 * Derives a 32-byte key for mailbox IMAP password encryption.
 */
function encryptionKey() {
  const material = env.credentialsEncryptionKey || env.jwtSecret;
  return crypto.createHash('sha256').update(material).digest();
}

/**
 * Encrypts a mailbox IMAP password for storage in MongoDB.
 * @param {string} plain
 */
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a stored mailbox IMAP password.
 * @param {string} stored
 */
export function decryptSecret(stored) {
  const [ivB64, tagB64, dataB64] = String(stored).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted credential format');
  }
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
