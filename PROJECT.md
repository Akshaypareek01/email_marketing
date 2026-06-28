# PROJECT.md — Mail Box (Email Marketing SaaS) — Full Flow & Goal

> One-page map of the whole system: what we're building, why, how a request flows
> end to end, and where every piece lives. Start here, then dive into `docs/`.

---

## 1. The goal (what we're trying to achieve)

**Mail Box is a multi-tenant email marketing SaaS.** Customers sign up, verify their
sending domain, buy a monthly plan with an email quota, import contacts, build
templates, and run email campaigns — all sent through **one shared AWS SES account**.

### The single most important constraint
We send for **all customers on one shared SES account**. If the account-wide
**bounce rate ≥ 5%** or **complaint rate ≥ 0.1%**, AWS can pause sending for
*everyone at once*. So the core of the product is **reputation protection**:
per-tenant bounce/complaint tracking, suppression lists, send-rate guardrails, and
**auto-disabling risky senders** before they can hurt the shared account.

The customer journey we enable, self-serve, end to end:
**register → verify domain → buy plan → import contacts → send a campaign → see analytics.**

Full detail: [`docs/PRD.md`](docs/PRD.md). Build order & status: [`docs/ROADMAP.md`](docs/ROADMAP.md).
Current build status: [`docs/BUILD-STATUS.md`](docs/BUILD-STATUS.md).

---

## 2. Stack & top-level layout

| Folder      | Stack                                              |
|-------------|----------------------------------------------------|
| `backend/`  | Node.js, Express, MongoDB (Mongoose), Redis + BullMQ |
| `frontend/` | Next.js (App Router), TypeScript, Tailwind         |
| `docs/`     | PRD, roadmap, deploy runbook, KYC flow, SES setup  |

- Backend API base: `http://localhost:4000/api`
- Frontend app: `http://localhost:3000`
- External services: **AWS SES** (outbound), **Stalwart** (inbox/IMAP), billing
  provider (Direct / Stripe / Razorpay), AWS SNS (SES event webhooks).

---

## 3. The "enter" points (where execution begins)

### Backend entry: `backend/src/index.js` → `backend/src/app.js`
1. `index.js` is the process entry (`npm run dev`). On boot it:
   - `assertSecureConfig()` — validates required env / secrets (`config/env.js`).
   - `connectDb()` — connects MongoDB (`config/db.js`).
   - Starts background jobs: **billing grace**, **suppression sync**, **platform
     reputation**, and a 60s interval that runs **due scheduled campaigns**.
   - `app.listen(env.port)` — starts the HTTP server.
2. `app.js` builds the Express app: CORS allowlist, raw-body webhook routes
   (billing + SES SNS) registered **before** `express.json()`, request logging,
   then mounts all route modules under `/api/*`, a 404 handler, and `errorHandler`.

**API route map** (mounted in `app.js`, each file in `backend/src/routes/`):
`/api/health`, `/api/auth`, `/api/domains`, `/api/mailboxes`, `/api/email`,
`/api/plans`, `/api/admin`, `/api/account`, `/api/contacts`, `/api/templates`,
`/api/campaigns`, `/api/support`, `/api/public`, `/api/billing`, `/api/team`.

### Frontend entry: `frontend/src/app/`
- `app/layout.tsx` — root layout. `app/page.tsx` — public **marketing landing page**
  (hero, features, pricing, FAQ) with `/login` and `/register` CTAs.
- Route groups under `app/`:
  - **Auth (the login "enter"):** `login/`, `register/`, `verify-email/`,
    `forgot-password/`, `reset-password/`, plus `admin/login/`.
  - **Tenant app:** `dashboard/` (+ `inbox`, `contacts`, `compose`, `campaigns`,
    `templates`, `domains`, `mailboxes`, `team`, `billing`, `analytics`,
    `events`, `support`).
  - **Super admin:** `admin/` (+ `tenants`, `plans`, `transactions`, `suppressions`,
    `reputation`, `insights`, `audit`, `support`).
  - **Public:** `unsubscribe/`.
- All API calls go through `frontend/src/lib/api.ts` (base `NEXT_PUBLIC_API_URL`,
  default `http://localhost:4000/api`). Auth/session helpers in `lib/auth.ts`.

---

## 4. Auth flow (register / login / session)

Routes: `backend/src/routes/auth.routes.js` → `controllers/auth.controller.js`.

- **Register** (`POST /api/auth/register`): creates a **Tenant + Tenant Admin** user,
  sends an email-verification token. Rate-limited.
- **Login** (`POST /api/auth/login`): returns a short-lived **JWT access token** +
  a **refresh token**. Rate-limited per-IP and per-account.
- **Refresh / logout / forgot-password / reset-password / verify-email /
  resend-verification / me** round out the lifecycle.
- Protected routes use the `authenticate` middleware (`middleware/auth.js`); roles are
  enforced via RBAC (Super Admin / Tenant Admin / Tenant User).
- Frontend: on login the session (tokens) is stored via `lib/auth.ts`; `lib/api.ts`
  attaches the bearer token and **auto-retries with a refresh** on 401.

---

## 5. End-to-end request flow (example: sending a campaign)

```
Browser (Next.js page)
  → lib/api.ts (adds JWT)
  → Express route (/api/campaigns)
  → auth + RBAC + validate middleware
  → campaigns.controller.js
  → preflight: domain verified? quota left? suppression filtered? unsubscribe present?
  → enqueue BullMQ job (campaignSend.queue.js)
  → campaignSend.worker.js  ── throttled ──>  SES (ses.service.js)
  → SES emits events → SNS → POST /api/email/webhooks/sns (sns.controller.js)
  → EmailEvent records + per-tenant reputation metrics updated
  → platformReputation.job.js evaluates → auto-pause risky tenants if needed
  → frontend analytics pages read aggregated stats
```

Single sends and Gmail-style threading (`inbox`) route through the **same quota +
suppression checks**.

---

## 6. Background jobs & workers (`backend/src/`)

| Piece | File | Purpose |
|-------|------|---------|
| Campaign send queue | `queue/campaignSend.queue.js` | Enqueue bulk sends |
| Campaign send worker | `workers/campaignSend.worker.js` | Throttled SES delivery |
| Scheduled campaigns | `services/scheduledCampaign.service.js` | 60s tick in `index.js` |
| Billing grace | `jobs/billingGrace.job.js` | `past_due` → `suspended` policy |
| Platform reputation | `jobs/platformReputation.job.js` | Auto-pause risky tenants, kill switch |
| Suppression sync | `services/sesSuppressionSync.service.js` | Sync AWS account suppression list |

There is also a standalone `backend/src/worker.js` for running queue workers
separately from the API process.

---

## 7. Data model (Mongoose, `backend/src/models/`)

**Identity/tenancy:** `Tenant`, `User`, `RefreshToken`, `PasswordResetToken`,
`EmailVerificationToken`, `KycDocument`, `AuditLog`.
**Sending identity:** `Domain`, `Mailbox`.
**Audience:** `Contact`, `ContactList`, `Suppression`.
**Content & sending:** `Template`, `Campaign`, `CampaignRecipient`,
`EmailThread`, `EmailThreadMessage`, `EmailEvent`.
**Billing:** `Plan`, `Transaction`.
**Ops/support:** `SupportTicket`, `SystemNotice`, `PlatformSetting`.

`Tenant.status` drives gating: `active` / `restricted` / `past_due` / `suspended`.

---

## 8. SES reputation protection (the P0 safety system)

This is the heart of the business (PRD §6). Key mechanisms, all already in app code:

- **Global + per-tenant suppression lists**; hard bounce/complaint → suppress the
  address globally and never send again.
- **Per-tenant rolling bounce/complaint rates** with thresholds **stricter than AWS**
  (early warning) → warn, then **auto-pause** (`restricted`).
- **Send-rate caps**: per-tenant + a global limiter that never exceeds SES max rate;
  new tenants get a conservative **warm-up daily cap** that ramps.
- **Account-wide kill switch**: if aggregate metrics approach AWS limits, auto-throttle
  / pause the highest-risk tenants first — before AWS acts.
- **Mandatory one-click unsubscribe** (List-Unsubscribe header + footer) on all
  marketing email; sending without it is blocked.

Production wiring of SNS → webhook is the main manual step: see
[`docs/SNS-PRODUCTION-SETUP.md`](docs/SNS-PRODUCTION-SETUP.md) and
[`docs/DEPLOY-RUNBOOK.md`](docs/DEPLOY-RUNBOOK.md).

---

## 9. Run locally

```bash
# 1. MongoDB (Docker example)
docker run -d --name mailbox-mongo -p 27017:27017 mongo:7
# (Redis also required for BullMQ — run a redis container or local redis-server)

# 2. Backend
cd backend && cp .env.example .env && npm install && npm run dev   # → :4000/api

# 3. Frontend
cd frontend && cp .env.local.example .env.local && npm install && npm run dev   # → :3000
```

Seed scripts: `backend/src/scripts/` — `seedSuperAdmin.js`, `seedPlans.js`, `seed.js`.

---

## 10. Status & where to go next

- **App code:** Phases 0–4 complete (auth, billing/quota, reputation guardrails,
  contacts/campaigns/templates, analytics, support, admin panel). See
  [`docs/ROADMAP.md`](docs/ROADMAP.md).
- **Still manual / backlog:** production AWS SNS HTTPS subscription, plan-downgrade
  proration & overage add-ons, Razorpay API refunds, load tests & monitoring.
- **Golden rule:** *do not bulk-send in production before reputation guardrails are
  live and SNS events are flowing.*

---

## 11. Doc index

| Doc | What it covers |
|-----|----------------|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, personas, full feature spec |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phased build plan + status |
| [`docs/BUILD-STATUS.md`](docs/BUILD-STATUS.md) | Current build state |
| [`docs/IMPLEMENTATION-TRACKER.md`](docs/IMPLEMENTATION-TRACKER.md) | Task tracking |
| [`docs/DEPLOY-RUNBOOK.md`](docs/DEPLOY-RUNBOOK.md) | Deployment steps |
| [`docs/SNS-PRODUCTION-SETUP.md`](docs/SNS-PRODUCTION-SETUP.md) | SES → SNS webhook wiring |
| [`docs/SECURITY-HARDENING.md`](docs/SECURITY-HARDENING.md) | Security checklist |
| [`docs/KYC-VERIFICATION-FLOW.md`](docs/KYC-VERIFICATION-FLOW.md) | KYC verification flow |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Design system / UI |
| [`README.md`](README.md) | Quick start + API/threading overview |
</content>
</invoke>
