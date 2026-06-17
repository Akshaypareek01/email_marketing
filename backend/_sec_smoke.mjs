import jwt from 'jsonwebtoken';

// 1) app + config import cleanly
await import('./src/app.js');
console.log('1. app.js imports OK');

// 2) assertSecureConfig WARNS (not throws) in dev with their short secret
const { assertSecureConfig, env } = await import('./src/config/env.js');
try { assertSecureConfig(); console.log('2. dev mode: did not throw (warns) OK; isProduction=', env.isProduction); }
catch (e) { console.log('2. UNEXPECTED throw in dev:', e.message); }

// 3) JWT alg pinning: an HS256 token verifies; an alg:none token is rejected
const good = jwt.sign({ sub: 'x' }, env.jwtSecret, { algorithm: 'HS256' });
console.log('3a. HS256 verify:', !!jwt.verify(good, env.jwtSecret, { algorithms: ['HS256'] }));
const noneTok = jwt.sign({ sub: 'x' }, '', { algorithm: 'none' });
try { jwt.verify(noneTok, env.jwtSecret, { algorithms: ['HS256'] }); console.log('3b. alg:none ACCEPTED (BAD)'); }
catch { console.log('3b. alg:none rejected OK'); }

// 4) rate limiter: 21st call within window is blocked (in-memory fallback, no redis)
const { rateLimit } = await import('./src/middleware/rateLimit.js');
const mw = rateLimit({ windowMs: 60000, max: 3, keyFn: () => 'k' });
function run() { return new Promise((resolve) => {
  const res = { setHeader(){}, status(c){ this._c=c; return this; }, json(){ resolve(this._c||200); } };
  mw({ ip:'1.2.3.4', body:{} }, res, () => resolve(200));
}); }
const codes = []; for (let i=0;i<5;i++) codes.push(await run());
console.log('4. rate-limit codes (max3):', codes.join(','), codes.slice(3).every(c=>c===429)?'OK':'BAD');

// 5) unknown SES event type ignored (not counted as delivered)
const { mapSesEventType } = await import('./src/services/sesEvent.service.js');
console.log('5. unknown SES type ->', mapSesEventType('Weird'), mapSesEventType('Weird')===null?'OK':'BAD', '| Bounce ->', mapSesEventType('Bounce'));
