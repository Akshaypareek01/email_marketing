#!/usr/bin/env node
/**
 * Basic API smoke test — run with server up: npm run smoke
 */
const base = process.env.API_URL || 'http://localhost:4000/api';

async function check(path, expectStatus = 200) {
  const res = await fetch(`${base}${path}`);
  const body = await res.json().catch(() => ({}));
  if (res.status !== expectStatus) {
    throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const health = await check('/health');
  if (health.status !== 'ok' && health.status !== 'degraded') {
    throw new Error(`Unexpected health status: ${health.status}`);
  }
  await check('/plans/public');
  console.log('Smoke test passed:', { health: health.status, checks: health.checks });
}

main().catch((err) => {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
});
