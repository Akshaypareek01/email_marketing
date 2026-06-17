# Build Status — Mail Box

**Companion docs:** [`PRD.md`](./PRD.md) · [`ROADMAP.md`](./ROADMAP.md) · [`IMPLEMENTATION-TRACKER.md`](./IMPLEMENTATION-TRACKER.md) · [`SNS-PRODUCTION-SETUP.md`](./SNS-PRODUCTION-SETUP.md) · [`DEPLOY-RUNBOOK.md`](./DEPLOY-RUNBOOK.md)  
**Last updated:** 2026-05-31

---

## Executive summary

Mail Box is a **multi-tenant email marketing platform** with domain onboarding (SES + live DNS), mailboxes (Stalwart), single-send + threaded inbox, contacts/lists, templates, throttled campaigns (BullMQ when Redis is set), billing (direct / Stripe / Razorpay), quota + reputation guardrails, super-admin panel, support tickets, analytics, and tenant system notices.

**Application MVP:** feature-complete for self-serve tenant flows.  
**Ship to production:** Follow [`DEPLOY-RUNBOOK.md`](./DEPLOY-RUNBOOK.md) — AWS SNS/SES wiring + env secrets.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express 5, MongoDB (Mongoose), AWS SESv2, Redis/BullMQ (optional), Stalwart/JMAP + IMAP |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Billing | Direct mode, Stripe, Razorpay |
| Events | SNS → `/api/email/webhooks/sns`, suppression + auto-pause |

---

## Frontend routes (34)

**Tenant:** `/dashboard/*` (overview, domains, mailboxes, inbox, compose, contacts, templates, campaigns, analytics, billing, team, support, events)  
**Auth:** `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/unsubscribe`  
**Admin:** `/admin/*` (overview, tenants, plans, suppressions, transactions, audit, support, reputation)  
**Marketing:** `/` pricing/landing

---

## Feature status (high level)

| Area | Status |
|------|--------|
| Auth (refresh, reset, verify, rate limit) | ✅ |
| RBAC (API + sidebar + page-level UI) | ✅ |
| Domain DNS + MAIL FROM gate | ✅ |
| SES config sets + SNS webhook | 🟡 prod AWS manual |
| Quota + reputation auto-pause + platform auto-protect | ✅ |
| Billing (direct / Stripe / Razorpay) + plan change + quota add-ons + admin refund | ✅ |
| Campaigns + BullMQ worker | ✅ |
| Analytics + support tickets | ✅ |
| System notices + impersonation | ✅ |
| Contact consent tracking (API + UI) | ✅ |

---

## Key env vars

See `backend/.env.example`. Critical:

```env
MONGODB_URI=
JWT_SECRET=
AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
REDIS_URL=
BILLING_MODE=direct|provider
BILLING_PROVIDER=stripe|razorpay
PLATFORM_FROM_EMAIL=
SES_VERIFY_SNS_SIGNATURE=true
SES_SYNC_SUPPRESSIONS=true
```

---

## Post-MVP backlog

Plan downgrade proration · overage add-ons · Razorpay provider refunds · load tests · monitoring · drag-and-drop builder · automation journeys · A/B tests
