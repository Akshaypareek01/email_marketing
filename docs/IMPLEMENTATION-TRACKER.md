# Mail Box — Implementation Tracker

_Last updated: 2026-05-31_

Status key: ✅ done · 🟡 partial · ⬜ not started

---

## Phase 0–3 — Core PRD

| Area | Status |
|------|--------|
| Auth (refresh, reset, verify, rate limit) | ✅ |
| RBAC super_admin + tenant admin gates | ✅ |
| Domain DNS + MAIL FROM SES API | ✅ |
| SES config sets + OPEN/CLICK events | 🟡 (opt-in env + prod AWS) |
| SNS webhook + signature verify | ✅ |
| Quota + warm-up daily cap | ✅ |
| Reputation warn + auto-pause + `restricted` | ✅ |
| Suppression + soft bounce retry | ✅ |
| List hygiene preflight | ✅ |
| Billing direct/Stripe/Razorpay + cancel | ✅ |
| Grace period → suspend job | ✅ |
| Quota reset on renewal webhook | ✅ |
| Campaigns scheduled send | ✅ |
| Campaign stats from SES events | ✅ |
| Templates test-send + duplicate | ✅ |
| Contacts PATCH + disposable block | ✅ |
| System notices | ✅ |
| Platform auto-pause risky tenants (§6.4) | ✅ |
| Admin kill switch UI | ✅ |
| Admin quota override API | ✅ |
| Onboarding checklist (live data) | ✅ |

## Phase 4 — Admin & platform extras

| Item | Status |
|------|--------|
| Admin impersonate (audited, 1h JWT + exit banner) | ✅ |
| Ticket attachments + assignee UI | ✅ |
| MRR / cohort admin analytics | ✅ |
| Block template library | ✅ |
| Campaign attachments (create + send path) | ✅ |
| Team user invite (`/api/team`, `/dashboard/team`) | ✅ |
| AWS account-level suppression sync (job + admin button) | ✅ |
| Canned admin support responses | ✅ |
| Template import/export | ✅ |
| Platform auto-protect (§6.4) + tenant risk ranking UI | ✅ |
| Prod SNS HTTPS subscription | 📄 [`SNS-PRODUCTION-SETUP.md`](./SNS-PRODUCTION-SETUP.md) |
| Production deploy runbook | 📄 [`DEPLOY-RUNBOOK.md`](./DEPLOY-RUNBOOK.md) |

## Polish (2026-05-31)

| Item | Status |
|------|--------|
| Frontend RBAC (contacts, domains, mailboxes, campaigns, templates) | ✅ |
| Contact consent UI (import + edit modal) | ✅ |
| Admin transaction refund (`POST /admin/transactions/:id/refund`) | ✅ |
| Plan upgrade/downgrade with proration (Stripe/Razorpay + direct) | ✅ |
| Quota add-on packs (10k/50k/100k) + billing UI | ✅ |
| Razorpay provider refunds (when payment id stored) | ✅ |
| Health check with Redis ping (`GET /api/health`) | ✅ |
| Smoke test script (`npm run smoke` in backend) | ✅ |

See `docs/BUILD-STATUS.md` for stack overview.
