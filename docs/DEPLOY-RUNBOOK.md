# Production Deploy Runbook — Mail Box

**Companion docs:** [`PRD.md`](./PRD.md) · [`SNS-PRODUCTION-SETUP.md`](./SNS-PRODUCTION-SETUP.md) · [`BUILD-STATUS.md`](./BUILD-STATUS.md)  
**Last updated:** 2026-05-31

Step-by-step checklist to ship Mail Box to production and safely accept paying customers.

---

## Pre-flight decisions

Lock these before go-live:

| Decision | Options | Notes |
|----------|---------|-------|
| Billing provider | Razorpay (default) or Stripe | Env keys + **Admin → Plans → Payment gateway** |
| Plan tiers & prices | `npm run seed:plans` or admin UI | INR/USD, quotas, contact limits |
| Grace period | `BILLING_GRACE_DAYS` (default 7) | Days in `past_due` before suspend |
| App domains | `APP_URL`, `API_PUBLIC_URL`, `CORS_ORIGIN` | Must be HTTPS in prod |

---

## 1. Infrastructure

### Required services

| Service | Purpose |
|---------|---------|
| **MongoDB** | Primary data store |
| **Redis** | BullMQ campaign worker (required at scale) |
| **Node API** | Express on `PORT` (default 4000) |
| **Node worker** | `npm run worker` — campaign send queue |
| **Next.js frontend** | Tenant + admin UI |
| **AWS SES** | Shared outbound account for all tenants |

### Optional (inbox product)

| Service | Purpose |
|---------|---------|
| Stalwart | JMAP/IMAP mailboxes |
| IMAP sync | `npm run sync-inbox` cron |

### Process layout (minimum prod)

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Next.js    │────▶│  Express    │────▶│  MongoDB    │
│  (frontend) │     │  API        │     └─────────────┘
└─────────────┘     └──────┬──────┘
                           │
                    ┌──────▼──────┐     ┌─────────────┐
                    │  BullMQ     │────▶│  Redis      │
                    │  worker     │     └─────────────┘
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  AWS SES    │
                    └─────────────┘
```

Run **API** and **worker** as separate processes (systemd, PM2, ECS, etc.).

---

## 2. Environment variables

Copy `backend/.env.example` → `backend/.env` and set:

### Critical (must set)

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<openssl rand -hex 32>
CREDENTIALS_ENCRYPTION_KEY=<openssl rand -hex 32>
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
REDIS_URL=redis://...
APP_URL=https://app.yourdomain.com
API_PUBLIC_URL=https://api.yourdomain.com/api
CORS_ORIGIN=https://app.yourdomain.com
PLATFORM_FROM_EMAIL=noreply@yourdomain.com
REQUIRE_EMAIL_VERIFICATION=true
SES_VERIFY_SNS_SIGNATURE=true
SES_CONFIG_SETS_ENABLED=true
SES_SYNC_SUPPRESSIONS=true
BILLING_MODE=provider
```

### Frontend

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

### Billing gateway

Super admin selects the active gateway at **Admin → Plans → Payment gateway** (stored in DB; overrides `BILLING_PROVIDER` env after first save).

**Razorpay (recommended for INR):**

```env
BILLING_MODE=provider
BILLING_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

**Stripe:**

```env
BILLING_MODE=provider
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Webhook URL (both providers): `https://api.yourdomain.com/api/billing/webhook`

Add matching `razorpayPlanId` / `stripePriceId` on each plan in Admin → Plans.

### Reputation guardrails (defaults are safe; tune if needed)

```env
SES_BOUNCE_RATE_LIMIT=0.05
SES_COMPLAINT_RATE_LIMIT=0.001
SES_PLATFORM_PROTECT_RATIO=0.75
SES_PLATFORM_MIN_SAMPLE=200
SES_PLATFORM_MAX_PAUSES=3
CAMPAIGN_SEND_RATE=5
```

---

## 3. Database seed

```bash
cd backend
npm run seed:admin    # super admin account
npm run seed:plans    # default plan tiers (or create via /admin/plans)
```

Verify super admin login at `/admin/login`.

---

## 4. AWS SES setup

### 4a. Exit sandbox (if applicable)

Request production access in SES console. Until approved, you can only send to verified addresses.

### 4b. Platform sending domain

Verify your platform domain in SES for transactional mail (verify/reset emails via `PLATFORM_FROM_EMAIL`).

### 4c. SNS event pipeline

**Do not bulk-send until this is done.** Full steps: [`SNS-PRODUCTION-SETUP.md`](./SNS-PRODUCTION-SETUP.md).

Summary:

1. Create SNS topic `mailbox-ses-events`
2. HTTPS subscribe: `https://api.yourdomain.com/api/email/webhooks/sns`
3. Attach event destination (Send, Delivery, Bounce, Complaint, Open, Click) to each tenant configuration set
4. Set `SES_SNS_TOPIC_ARN` in `.env`

### 4d. End-to-end SNS test

1. Register a test tenant, verify domain (DKIM + SPF + DMARC + MAIL FROM)
2. Send a test campaign to a known address
3. Confirm API logs show `ses-event` ingestion
4. Trigger a hard bounce (invalid address) — confirm suppression list updates
5. Confirm campaign stats increment on delivery

---

## 5. Deploy application

### Backend API

```bash
cd backend
npm ci --omit=dev
npm start
```

Health check: `GET https://api.yourdomain.com/api/health` → `{ "status": "ok" }`

### Campaign worker

```bash
cd backend
npm run worker
```

Without Redis/worker, campaigns fall back to in-process sending (not recommended for prod).

### Frontend

```bash
cd frontend
npm ci
npm run build
npm start
```

---

## 6. Post-deploy verification

Run smoke test against prod API:

```bash
API_URL=https://api.yourdomain.com/api npm run smoke
```

### Manual tenant flow

- [ ] Register → verify email
- [ ] Add domain → publish DNS → verify active
- [ ] Subscribe to plan (checkout or direct mode)
- [ ] Import contacts CSV
- [ ] Create template with `{{unsubscribe_url}}`
- [ ] Send campaign → stats update after SNS events
- [ ] Check quota decrements on dashboard

### Admin flow

- [ ] Login at `/admin`
- [ ] View SES Health → bounce/complaint rates populate after sends
- [ ] Tenant risk ranking visible at `/admin/reputation`
- [ ] Kill switch halts/resumes sending
- [ ] Impersonate tenant (audited)
- [ ] Support ticket queue works

---

## 7. Safety gates before opening to customers

| Gate | How to verify |
|------|----------------|
| SNS events flowing | Bounce test updates suppression + stats |
| Quota enforcement | Exhaust quota → send blocked with upsell |
| Reputation auto-pause | Tenant with high bounce gets `restricted` |
| Platform auto-protect | Aggregate near limit → highest-risk tenants paused (`/admin/reputation`) |
| Unsubscribe | Marketing email blocked without footer link |
| Billing webhooks | Test payment success/failure updates subscription |

**Do not launch bulk sending until rows 1–4 pass.**

---

## 8. Monitoring (recommended)

Not built-in — add before scale:

- Uptime on `/api/health` (Mongo + Redis checks)
- Alert on platform bounce rate > 3% or complaint > 0.05%
- Alert on worker process down
- Log aggregation (CloudWatch, Datadog, etc.)
- SES account sending paused notification (AWS SNS → your ops channel)

---

## 9. Rollback

| Issue | Action |
|-------|--------|
| Bad deploy | Redeploy previous API/worker/frontend artifact |
| SES reputation crisis | Admin → SES Health → **Halt all sending** |
| Single bad tenant | Admin → tenant → pause sending |
| Platform auto-protect fired | Review audit log → resume tenants after list cleanup |

---

## 10. Backlog (post-launch)

- Load tests
- Razorpay edge-case refunds
- Plan downgrade proration polish
- Dedicated IP pools per high-volume tenant
- Drag-and-drop email builder

---

## Quick reference — webhook URLs

| Endpoint | Purpose |
|----------|---------|
| `POST /api/email/webhooks/sns` | SES bounce/complaint/delivery/open/click |
| `POST /api/billing/webhooks/stripe` | Stripe subscriptions |
| `POST /api/billing/webhooks/razorpay` | Razorpay subscriptions |
| `POST /api/email/webhooks/stalwart` | Inbound mail (optional) |

All must be **HTTPS** and reachable from the public internet.
