# Security Hardening — Change Log & Required Ops Steps

Applied 2026-06-17 following the full-stack security audit. This records the code fixes
made and the **deployment/AWS-side actions you still must take** for them to be fully effective.

---

## Code fixes applied

### Critical
- **Reset/verification tokens no longer leak.** `devResetUrl`/`devVerifyUrl` are now returned and
  logged ONLY when `NODE_ENV !== 'production'` (previously gated on `LOG_LEVEL=debug`, the default).
  Live tokens are never logged. — `auth.controller.js`, `passwordReset.service.js`, `emailVerification.service.js`
- **JWT algorithm pinned to HS256** on every verify (`auth.js`, `authQuery.js`, `unsubscribeToken.service.js`)
  and explicit `algorithm: 'HS256'` on every sign. Blocks `alg:none` / key-confusion forgery. (Verified: forged `alg:none` token is rejected.)
- **Fail-fast secret validation** at startup (`assertSecureConfig()` in `index.js` + `worker.js`):
  in production, missing/short (<32 char)/default `JWT_SECRET`, missing `CREDENTIALS_ENCRYPTION_KEY`,
  wildcard CORS, or disabled SNS verification **throw and refuse to boot**. In development they warn only.
- **SES SNS signature verification forced ON in production**; supports SignatureVersion 1 (SHA1) and 2 (SHA256);
  rejects events whose `TopicArn` ≠ `SES_SNS_TOPIC_ARN`. `SubscribeURL` host is validated unconditionally
  (anti-SSRF), even when verification is off. — `snsVerify.service.js`, `sns.controller.js`

### High
- **Dedicated credential key encouraged** — `assertSecureConfig` flags reuse of `JWT_SECRET` for
  credential encryption. (Kept the JWT fallback so existing ciphertext still decrypts — see "re-encrypt" below.)
- **Reputation window rollover no longer auto-un-pauses** a tenant paused for bad reputation. A repeat
  spammer stays paused until an operator clears it (`/api/admin/tenants/:id/sending`). — `sendingGuard.service.js`
- **Absolute-count auto-pause tripwire** — a tenant is paused once it accrues `SES_COMPLAINT_ABS_LIMIT`
  (default 5) complaints or `SES_BOUNCE_ABS_LIMIT` (default 10) hard bounces in the window, **regardless of
  sample size**. Closes the new-sender spam-trap gap. — `sendingGuard.service.js`
- **Unknown SES event types are ignored**, not counted as `delivered`. Unattributed events are logged. — `sesEvent.service.js`
- **Rate limiter is now Redis-backed** (shared across instances) with in-memory fallback, plus
  `app.set('trust proxy', 1)` in production so `X-Forwarded-For` can't be spoofed to bypass limits.
  Added a **per-account** limit (10 / 15 min by email) on login/forgot/reset. — `rateLimit.js`, `app.js`, `auth.routes.js`

### Medium / Low
- **Generic 5xx responses** — internal error messages no longer leaked to clients (logged server-side only). — `errorHandler.js`
- **Strict CORS allowlist** (comma-separated `CORS_ORIGIN`), methods/headers pinned, never `*` with credentials. — `app.js`, `env.js`
- **Plan create/update field allowlist** (no mass assignment). — `plans.controller.js`
- **Razorpay webhook** signature compared with `crypto.timingSafeEqual`. — `RazorpayBillingProvider.js`
- **Team invite temp password** no longer returned in API responses in production (email-only). — `team.service.js`
- **Domain-exists** response no longer discloses cross-tenant ownership. — `domains.controller.js`
- **Template preview HTML sanitized** with `isomorphic-dompurify` (XSS). — `frontend/.../templates/[id]/page.tsx`
- **Frontend `.gitignore`** now excludes `.env*.local` before any `git init`.

---

## ⚠️ Required ops / deployment actions (code alone is not enough)

1. **Set production env** before deploy:
   - `NODE_ENV=production`
   - `JWT_SECRET` = random ≥32 chars (the app will refuse to boot otherwise)
   - `CREDENTIALS_ENCRYPTION_KEY` = separate random ≥32 chars
   - `CORS_ORIGIN` = your real frontend origin(s), comma-separated; never `*`
   - `REDIS_URL` = set so the rate limiter is shared across instances
2. **AWS SES event pipeline (this is what makes auto-suspend actually fire):**
   - Set `SES_CONFIG_SETS_ENABLED=true` **and** `SES_SNS_TOPIC_ARN=<your topic>`, then ensure each tenant's
     configuration set has the SNS event destination (created by `ensureTenantConfigSet`). Without this, AWS
     emits no bounce/complaint events and reputation auto-pause cannot trigger. See `docs/SNS-PRODUCTION-SETUP.md`.
   - Confirm the SNS subscription points at `POST /api/email/webhooks/sns`.
3. **Re-encrypt stored IMAP credentials** if you introduce a new `CREDENTIALS_ENCRYPTION_KEY` that differs
   from the old JWT-derived key (existing ciphertext is bound to the old key).
4. **`.gitignore` the real secrets** — this project is currently NOT a git repo (verified). Before running
   `git init`, ensure root `.gitignore` excludes `backend/.env`. If you ever commit it, rotate all keys.

---

## Known residual items (need a dedicated, larger change — not done here)

- **Frontend auth tokens live in `localStorage`** (XSS-stealable), and the super-admin token is stashed in
  `sessionStorage` during impersonation. Moving to httpOnly, SameSite cookies is a coordinated backend+frontend
  change (cookie issuance, CSRF tokens, CORS `credentials`) and was intentionally NOT attempted piecemeal.
  Mitigation in place meanwhile: template HTML is sanitized (removes the most likely XSS sink).
- **Platform reputation guard** still runs via in-process timers (`jobs/platformReputation.job.js`). Moving it
  to a durable BullMQ repeatable job (so it survives restarts and runs in the worker) is recommended.
- **Impersonation tokens** have no `jti`/revocation list (1h expiry only).
- **Registration** still returns `409 Email already registered` (account enumeration) — left as a product/UX decision.
