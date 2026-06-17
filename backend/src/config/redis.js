import Redis from 'ioredis';
import { env } from './env.js';
import logger from '../middleware/logsCreate.js';

/** @type {Redis | null} */
let client = null;

/**
 * Whether Redis-backed queues are configured.
 * @returns {boolean}
 */
export function isRedisEnabled() {
  return Boolean(env.redis.url);
}

/**
 * Shared Redis connection for BullMQ (lazy singleton).
 * @returns {Redis | null}
 */
export function getRedisConnection() {
  if (!env.redis.url) return null;

  if (!client) {
    client = new Redis(env.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    client.on('error', (err) => {
      logger.error({ tag: 'redis', message: err.message });
    });
  }

  return client;
}

/**
 * Close the Redis connection (worker/API shutdown).
 * @returns {Promise<void>}
 */
export async function closeRedisConnection() {
  if (!client) return;
  await client.quit();
  client = null;
}
