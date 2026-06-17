import { Router } from 'express';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { env } from '../config/env.js';

const router = Router();

/**
 * Liveness + dependency checks for load balancers and monitoring.
 */
router.get('/', async (req, res) => {
  const checks = {
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: 'skipped',
  };

  if (env.redis.url) {
    const redis = new Redis(env.redis.url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    try {
      await redis.connect();
      await redis.ping();
      checks.redis = 'connected';
    } catch {
      checks.redis = 'disconnected';
    } finally {
      redis.disconnect();
    }
  }

  const ok = checks.db === 'connected' && (checks.redis === 'connected' || checks.redis === 'skipped');

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'mailbox-api',
    version: process.env.npm_package_version || '1.0.0',
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
