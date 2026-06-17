# Roadmap — Mail Box (MVP-first phased build)

Companion to `docs/PRD.md`. Strategy: ship the smallest thing we can **sell and run
safely**, then add growth features.

Legend: ✅ done · 🟡 partial / prod manual · 🔨 backlog

---

## Phase 0 — Foundation hardening ✅
- Auth: email verification, password reset, refresh tokens, rate limiting
- RBAC (Super Admin / Tenant Admin / Tenant User) — API + UI
- SES event publishing: configuration sets, SNS → webhook
- Verified-domain-only sending; DMARC + custom MAIL FROM gates
- Redis + BullMQ worker
- Audit log model

---

## Phase 1 — MVP: Sellable & safe core ✅

### 1a. Plans, billing & quota
- Plan / subscription / transaction models
- Super admin plan CRUD
- BillingProvider (direct / Stripe / Razorpay)
- Checkout, webhooks, cancel, change plan
- Hard quota gate + dashboard usage
- Admin refund on paid transactions

### 1b. SES reputation protection ✅
- Suppression list, bounce/complaint auto-suppress
- Soft bounce handling
- Per-tenant metrics + auto-pause / `restricted`
- Warm-up daily cap + global rate limit
- Platform kill switch + **auto-protect highest-risk tenants** (PRD §6.4)
- Mandatory unsubscribe on marketing email

### 1c. Super admin panel ✅
- Tenant management, quota override, impersonate
- Transactions, MRR/cohort analytics
- Suppressions + AWS sync
- Support queue

**Ship line:** met in application code. Production requires AWS SNS setup.

---

## Phase 2 — Audience & campaigns ✅
- Contacts, lists, CSV import/export, consent tracking
- Templates: HTML, blocks, merge tags, import/export, test-send
- Campaigns: preflight, throttled send, schedule, attachments, stats

---

## Phase 3 — Analytics & support ✅
- Tenant analytics + reputation widget
- Open/click via SES events
- Support tickets with attachments
- System notices

---

## Phase 4 — Polish ✅ (app code)
- Onboarding checklist (live counts)
- Team invites
- Block template library
- Template import/export
- Frontend RBAC on admin-only actions

### Still manual / backlog
- 🟡 Prod SNS HTTPS subscription ([`SNS-PRODUCTION-SETUP.md`](./SNS-PRODUCTION-SETUP.md)) — use [`DEPLOY-RUNBOOK.md`](./DEPLOY-RUNBOOK.md) §4
- 🔨 Plan downgrade proration, overage add-ons
- 🔨 Razorpay API refunds
- 🔨 Load tests, monitoring/alerting

---

## Backlog (not scheduled)
Dedicated IP pools · drag-and-drop builder · automation/drip journeys · A/B testing ·
per-customer SES sub-accounts · multi-region failover

---

## Build order (reference)
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → **prod AWS wiring** → backlog.

Do not bulk-send before reputation guardrails are live in production.
