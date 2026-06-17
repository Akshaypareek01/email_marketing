import { evaluatePlatformReputationGuard } from '../services/platformReputationGuard.service.js';
import logger from '../middleware/logsCreate.js';

const INTERVAL_MS = Number(process.env.PLATFORM_REPUTATION_JOB_MS) || 5 * 60 * 1000;
const DEBOUNCE_MS = Number(process.env.PLATFORM_REPUTATION_DEBOUNCE_MS) || 8000;

/** @type {ReturnType<typeof setTimeout> | null} */
let debounceTimer = null;
/** @type {ReturnType<typeof setInterval> | null} */
let intervalHandle = null;

/**
 * Run platform reputation guard once; safe to call from cron or SES event hook.
 */
export async function runPlatformReputationGuard() {
  try {
    const result = await evaluatePlatformReputationGuard();
    if (result.action === 'paused') {
      logger.warn({ tag: 'platform-protect', message: 'Paused risky tenants', result });
    }
    return result;
  } catch (err) {
    logger.error({ tag: 'platform-protect', error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Debounced evaluation after SES events to avoid hammering Mongo on bursts.
 */
export function schedulePlatformReputationCheck() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runPlatformReputationGuard().catch(() => {});
  }, DEBOUNCE_MS);
}

/**
 * Start periodic platform reputation evaluation in the API process.
 */
export function startPlatformReputationJob() {
  if (intervalHandle) return;
  runPlatformReputationGuard().catch(() => {});
  intervalHandle = setInterval(() => {
    runPlatformReputationGuard().catch(() => {});
  }, INTERVAL_MS);
}
