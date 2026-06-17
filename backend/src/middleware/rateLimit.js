import { getRedisConnection } from '../config/redis.js';
import logger from './logsCreate.js';

/**
 * In-memory fallback store (per-process). Used only when Redis is not configured.
 * @type {Map<string, { count: number, resetAt: number }>}
 */
const buckets = new Map();

/**
 * Increment a counter for `key` within a fixed window, returning the running count.
 * Uses Redis (shared across instances) when available, else a per-process Map.
 * @param {string} key
 * @param {number} windowMs
 * @returns {Promise<{ count: number, resetMs: number }>}
 */
async function hit(key, windowMs) {
  const redis = getRedisConnection();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, windowMs);
      let ttl = await redis.pttl(redisKey);
      if (ttl < 0) ttl = windowMs; // key with no expiry — treat as full window
      return { count, resetMs: ttl };
    } catch (err) {
      // Fail open to the in-memory limiter rather than blocking all auth on a Redis blip.
      logger.warn({ tag: 'rate-limit', message: 'Redis limiter failed, using memory', error: err.message });
    }
  }

  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return { count: bucket.count, resetMs: bucket.resetAt - now };
}

/**
 * Fixed-window rate limiter. Redis-backed when REDIS_URL is set; per-process otherwise.
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.max
 * @param {(req: import('express').Request) => string} opts.keyFn
 */
export function rateLimit({ windowMs, max, keyFn }) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const key = keyFn(req);
      const { count, resetMs } = await hit(key, windowMs);
      if (count > max) {
        const retryAfter = Math.ceil(resetMs / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Too many requests. Try again later.' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Rate limit key from client IP. With `trust proxy` configured (see app.js),
 * req.ip is the real client and cannot be spoofed via X-Forwarded-For.
 * @param {import('express').Request} req
 */
export function ipKey(req) {
  return `ip:${req.ip || 'unknown'}`;
}

/**
 * Rate limit key from the request's email field (per-account throttling).
 * @param {import('express').Request} req
 */
export function emailKey(req) {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return email ? `email:${email}` : ipKey(req);
}

/** Standard auth endpoint limit: 20 requests / 15 min per IP. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: ipKey,
});

/** Stricter per-account limit for credential endpoints (login / forgot / reset): 10 / 15 min per email. */
export const accountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: emailKey,
});
