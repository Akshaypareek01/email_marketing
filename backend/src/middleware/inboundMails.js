import '../config/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../config/db.js';
import { fetchEmails } from '../services/stalwart.service.js';

import { env } from '../config/env.js';
import { Mailbox } from '../models/Mailbox.js';
import { getEnvImapCredentials, getMailboxImapCredentials } from '../services/stalwart.service.js';

async function runInboxSync() {
  const email = env.imap.user;
  if (!email) {
    console.error('Set IMAP_USER in backend/.env to the mailbox address to sync.');
    process.exit(1);
  }

  const mailbox = await Mailbox.findOne({ address: email.toLowerCase() }).select('+imapPasswordEnc');
  const credentials = getMailboxImapCredentials(mailbox) || getEnvImapCredentials(email);
  if (!credentials) {
    console.error('No credentials for', email, '— link via API or set IMAP_PASSWORD in .env');
    process.exit(1);
  }

  await connectDb();

  try {
    const stats = await fetchEmails(credentials);
    console.log('[inboundMails] sync complete', stats);
    if (stats.saved === 0 && stats.exists === 0) {
      console.log(
        '[inboundMails] No messages in synced folders. Check IMAP_SYNC_FOLDERS or send mail to this mailbox.'
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

runInboxSync().catch((err) => {
  console.error('[inboundMails] failed:', err);
  process.exit(1);
});
