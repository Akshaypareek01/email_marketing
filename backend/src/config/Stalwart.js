import { ImapFlow } from 'imapflow';
import { env } from './env.js';

export function createImapClient({ user, pass }) {
  const host = env.imap.host;
  if (!host) {
    throw new Error(
      'IMAP_HOST is empty. Set IMAP_HOST in backend/.env to a hostname that resolves (e.g. 127.0.0.1 if Stalwart runs on this machine).'
    );
  }

  const options = {
    host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: {
      user,
      pass,
    },
    /** Explicit so self-signed dev certs work when IMAP_TLS_INSECURE is set. */
    tls: {
      rejectUnauthorized: !env.imap.tlsInsecure,
    },
    /** Keep IMAP wire protocol off the terminal unless IMAP_DEBUG=true */
    logger: env.imap.debug,
    logRaw: false,
  };

  return new ImapFlow(options);
}
