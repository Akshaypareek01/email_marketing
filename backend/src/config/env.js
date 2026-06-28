import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Always load backend/.env from this file’s location (works even if process cwd is not `backend/`). */
dotenv.config({ path: path.join(__dirname, '../../.env') });

/** First non-empty env var; strips accidental `|| fallback` suffixes from .env lines. */
function firstEnvValue(...names) {
  for (const name of names) {
    let v = process.env[name];
    if (v == null || v === '') continue;
    v = String(v).trim();
    if (v.includes('||')) v = v.split('||')[0].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    return v;
  }
  return '';
}

/** Accept true / 1 / yes / on (case-insensitive). */
function envFlag(name) {
  let v = process.env[name];
  if (v == null || v === '') return false;
  v = String(v).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/** Sentinel dev secret — must never be used in production. */
const DEV_JWT_SECRET = 'dev-secret-change-me';

/** Parse duration strings like 15m, 7d, 1h into milliseconds. */
function parseDurationMs(value) {
  const m = String(value).trim().match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!m) return Number(value) || 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (mult[unit] || 86400000);
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mailbox',
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  auth: {
    accessExpiresIn: firstEnvValue('JWT_ACCESS_EXPIRES_IN') || '15m',
    refreshExpiresMs: parseDurationMs(firstEnvValue('JWT_REFRESH_EXPIRES_IN') || '7d'),
    passwordResetExpiresMs: parseDurationMs(firstEnvValue('PASSWORD_RESET_EXPIRES_IN') || '1h'),
    emailVerificationExpiresMs: parseDurationMs(firstEnvValue('EMAIL_VERIFICATION_EXPIRES_IN') || '24h'),
    requireEmailVerification: envFlag('REQUIRE_EMAIL_VERIFICATION'),
  },
  /** Free-trial policy: new tenants get full access for this many days, then must buy a plan. */
  trial: {
    days: Number(process.env.TRIAL_DAYS) || 7,
  },
  /** Encrypts per-mailbox IMAP passwords at rest (defaults to JWT_SECRET). */
  credentialsEncryptionKey: firstEnvValue('CREDENTIALS_ENCRYPTION_KEY', 'JWT_SECRET'),
  corsOrigin: firstEnvValue('CORS_ORIGIN') || 'http://localhost:3000',
  /** Strict allowlist of permitted browser origins (comma-separated CORS_ORIGIN). */
  corsOrigins: (firstEnvValue('CORS_ORIGIN') || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  stalwart: {
    apiUrl: firstEnvValue('STALWART_API_URL', 'STALWART_URL') || 'http://localhost:8080',
    /** Optional override; otherwise resolved from /.well-known/jmap */
    jmapUrl: firstEnvValue('STALWART_JMAP_URL'),
    admin: firstEnvValue('STALWART_ADMIN'),
    password: firstEnvValue('STALWART_PASSWORD'),
    apiKey: process.env.STALWART_API_KEY || '',
  },
  platformMxHost: process.env.PLATFORM_MX_HOST || 'mail.yourplatform.com',
  /**
   * Inbound mail (Stalwart JMAP/IMAP, webhooks, inbox sync).
   * false = outbound-only: tenants verify domain in SES, create sender addresses, send via SES.
   * true = full mailbox provisioning on Stalwart + MX DNS required for receiving.
   */
  inboundEmailEnabled: envFlag('INBOUND_EMAIL_ENABLED'),
  /** When set, POST /api/email/webhooks/inbound must send this header value */
  inboundWebhookSecret: process.env.INBOUND_WEBHOOK_SECRET || '',
  /** IMAP (Stalwart / sync-inbox). Host must resolve via DNS or use 127.0.0.1 / localhost. */
  imap: {
    host: (process.env.IMAP_HOST || '').trim(),
    port: Number(process.env.IMAP_PORT) || 993,
    /** Set IMAP_SECURE=false for plain IMAP on port 143 (uncommon). */
    secure: process.env.IMAP_SECURE !== 'false',
    /**
     * Dev / lab only: IMAP_TLS_INSECURE=true|1|yes|on — accept self-signed certs (DEPTH_ZERO_SELF_SIGNED_CERT).
     * Do not enable against untrusted networks or production mail servers.
     */
    tlsInsecure: envFlag('IMAP_TLS_INSECURE'),
    user: firstEnvValue('IMAP_USER'),
    password: firstEnvValue('IMAP_PASSWORD'),
    /** Comma-separated IMAP folders to import as inbound (Stalwart often lands mail in Junk Mail). */
    syncFolders: (firstEnvValue('IMAP_SYNC_FOLDERS') || 'INBOX,Junk Mail')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    debug: envFlag('IMAP_DEBUG'),
  },
  logLevel: firstEnvValue('LOG_LEVEL') || 'info',
  /**
   * SES reputation guardrails (P0). AWS suspends accounts above 5% bounce / 0.1% complaint.
   * We auto-pause tenants well below those ceilings, but only after a minimum sample so a
   * single early bounce can't pause a brand-new sender.
   */
  reputation: {
    bounceRateLimit: Number(process.env.SES_BOUNCE_RATE_LIMIT) || 0.05,
    complaintRateLimit: Number(process.env.SES_COMPLAINT_RATE_LIMIT) || 0.001,
    /** Pause a tenant once it crosses this fraction of the AWS ceiling. */
    warnRatio: Number(process.env.SES_WARN_RATIO) || 0.6,
    pauseRatio: Number(process.env.SES_PAUSE_RATIO) || 0.8,
    /** Don't act on rates until at least this many messages have been sent in the window. */
    minSampleSize: Number(process.env.SES_MIN_SAMPLE_SIZE) || 50,
    /** Reputation rolling window, in days. */
    windowDays: Number(process.env.SES_WINDOW_DAYS) || 14,
    /**
     * Absolute-count tripwires — pause a tenant once it accrues this many complaints/
     * hard bounces in the window REGARDLESS of sample size. Closes the new-sender gap
     * where the first <minSampleSize sends to a spam-trap list trigger nothing.
     */
    complaintAbsoluteLimit: Number(process.env.SES_COMPLAINT_ABS_LIMIT) || 5,
    bounceAbsoluteLimit: Number(process.env.SES_BOUNCE_ABS_LIMIT) || 10,
    /** Platform-wide: act when aggregate rate reaches this fraction of AWS limit (PRD §6.4). */
    platformProtectRatio: Number(process.env.SES_PLATFORM_PROTECT_RATIO) || 0.75,
    /** Minimum platform sends before account-wide protect runs. */
    platformMinSampleSize: Number(process.env.SES_PLATFORM_MIN_SAMPLE) || 200,
    /** Max tenants auto-paused per evaluation cycle. */
    platformMaxAutoPausesPerRun: Number(process.env.SES_PLATFORM_MAX_PAUSES) || 3,
  },
  /** Master kill switch — when true, ALL outbound sending is blocked platform-wide. */
  platformSendingHalted: envFlag('PLATFORM_SENDING_HALTED'),
  /**
   * Default platform-wide rolling 24h send cap (total across all tenants). Protects the
   * shared AWS SES account. Super-admin can override this live in the admin panel.
   */
  platformDailySendLimit: Number(process.env.PLATFORM_DAILY_SEND_LIMIT) || 50000,
  /** Public app URL for unsubscribe links and billing redirects. */
  appUrl: firstEnvValue('APP_URL', 'CORS_ORIGIN') || 'http://localhost:3000',
  campaign: {
    /** Max campaign emails per second (stay below SES account limit). */
    sendRatePerSecond: Number(process.env.CAMPAIGN_SEND_RATE) || 5,
  },
  billing: {
    /** `direct` = assign plan without payment (MVP); `provider` = require Stripe/Razorpay. */
    mode: firstEnvValue('BILLING_MODE') || 'direct',
    /** stripe | razorpay (when mode=provider) — overridden by super admin in platform settings */
    provider: firstEnvValue('BILLING_PROVIDER') || 'razorpay',
    stripe: {
      secretKey: firstEnvValue('STRIPE_SECRET_KEY') || '',
      webhookSecret: firstEnvValue('STRIPE_WEBHOOK_SECRET') || '',
    },
    razorpay: {
      keyId: firstEnvValue('RAZORPAY_KEY_ID') || '',
      keySecret: firstEnvValue('RAZORPAY_KEY_SECRET') || '',
      webhookSecret: firstEnvValue('RAZORPAY_WEBHOOK_SECRET') || '',
    },
  },
  transactional: {
    fromEmail: firstEnvValue('PLATFORM_FROM_EMAIL') || '',
    fromName: firstEnvValue('PLATFORM_FROM_NAME') || 'Mail Box',
  },
  /** Base URL for public API links (unsubscribe one-click). */
  apiPublicUrl: firstEnvValue('API_PUBLIC_URL') || `http://localhost:${Number(process.env.PORT) || 4000}/api`,
  redis: {
    /** When unset, campaign sends fall back to in-process throttling. */
    url: firstEnvValue('REDIS_URL') || '',
  },
  ses: {
    /** Create per-tenant SES configuration sets and attach to sends. */
    enableConfigSets: envFlag('SES_CONFIG_SETS_ENABLED'),
    /** SNS topic for bounce/complaint/delivery events (optional). */
    snsTopicArn: firstEnvValue('SES_SNS_TOPIC_ARN') || '',
    /** Verify SNS message signatures. Forced ON in production (fail-closed). */
    verifySnsSignature: envFlag('SES_VERIFY_SNS_SIGNATURE') || process.env.NODE_ENV === 'production',
  },
  /** Cloudflare R2 (S3-compatible) — private bucket for KYC documents. */
  r2: {
    accessKeyId: firstEnvValue('R2_ACCESS_KEY_ID'),
    secretAccessKey: firstEnvValue('R2_SECRET_ACCESS_KEY'),
    endpoint: firstEnvValue('R2_ENDPOINT'),
    bucket: firstEnvValue('R2_BUCKET_NAME'),
    /** Public base URL — only for non-sensitive assets, never KYC documents. */
    publicUrl: firstEnvValue('R2_PUBLIC_URL'),
  },
  /** KYC / business verification (GST / PAN) policy. */
  kyc: {
    /** Gate sending on approved KYC once the free allowance is used up. */
    required: envFlag('KYC_REQUIRED'),
    /** Presigned PUT (browser upload) lifetime, seconds. */
    uploadUrlTtl: Number(process.env.KYC_UPLOAD_URL_TTL) || 300,
    /** Presigned GET (admin review) lifetime, seconds. */
    viewUrlTtl: Number(process.env.KYC_VIEW_URL_TTL) || 120,
    /** Max accepted document size, bytes (default 5 MB). */
    maxFileBytes: Number(process.env.KYC_MAX_FILE_BYTES) || 5 * 1024 * 1024,
    /** Free emails allowed before KYC is required (0 = block immediately). */
    sendLimitBeforeKyc: Number(process.env.KYC_SEND_LIMIT_BEFORE_KYC) || 200,
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png'],
  },
};

/**
 * Fail-fast validation of security-critical configuration. Called at process
 * startup (index.js / worker.js) so misconfiguration crashes loudly instead of
 * silently booting with a known-weak secret. Throwing here — not at import time —
 * keeps tests and tooling that merely import `env` working.
 */
export function assertSecureConfig() {
  const problems = [];

  if (!process.env.JWT_SECRET || env.jwtSecret === DEV_JWT_SECRET) {
    problems.push('JWT_SECRET is missing or set to the insecure dev default.');
  } else if (env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is too short (require >= 32 characters).');
  }

  if (!firstEnvValue('CREDENTIALS_ENCRYPTION_KEY')) {
    problems.push(
      'CREDENTIALS_ENCRYPTION_KEY is unset — stored credentials are encrypted with a key ' +
        'derived from JWT_SECRET. Set a dedicated key for defense in depth.'
    );
  }

  if (env.corsOrigins.includes('*')) {
    problems.push('CORS_ORIGIN must not be "*" with credentialed requests.');
  }

  if (env.isProduction && !env.ses.verifySnsSignature) {
    problems.push('SES SNS signature verification must be enabled in production.');
  }

  if (!problems.length) return;

  const banner = `Insecure configuration:\n  - ${problems.join('\n  - ')}`;
  // Fail-fast in production; in development warn loudly but allow startup so local
  // work isn't blocked by a convenience secret.
  if (env.isProduction) {
    throw new Error(banner);
  }
  // eslint-disable-next-line no-console
  console.warn(`[config] ${banner}\n  (development mode — set these before deploying to production)`);
}
