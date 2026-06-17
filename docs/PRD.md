# PRD — Mail Box: Production Email Marketing SaaS

**Owner:** Akshay
**Status:** Draft for approval
**Last updated:** 2026-05-31
**Doc location:** `docs/PRD.md`

---

## 1. Summary

Mail Box is a multi-tenant email marketing SaaS. Customers sign up, connect and verify
their sending domain, buy a monthly plan with an email quota, build/import contacts,
create templates, and run email campaigns through **our shared AWS SES account**.

A basic foundation already exists (domain connection + DKIM via SES, mailbox model,
Gmail-style threading, single-send with attachments, SES/inbound webhooks). This PRD
turns that foundation into a **sellable, production-ready product** with billing,
plans, quotas, campaigns, analytics, a super-admin panel, support, and — most
critically — **AWS SES reputation protection** so that one bad customer cannot get our
shared SES account throttled or suspended.

### The single most important constraint

We send on **one shared SES account** on behalf of all customers. If our account-wide
bounce rate exceeds **5%** or complaint rate exceeds **0.1%**, AWS places us under
review and can **pause sending for every customer at once**. Every feature decision in
this PRD is secondary to keeping that account healthy. Reputation protection is not a
"nice to have" — it is the core of the business and is treated as P0 throughout.

---

## 2. Goals & non-goals

### Goals
- A customer can self-serve end to end: register → verify domain → buy plan → import
  contacts → send a campaign → see analytics.
- Super admin can manage customers, plans, payments/transactions, quotas, and force
  suspend/enable accounts.
- Monthly plans with hard email quotas; sends are blocked when quota is exhausted.
- Protect the shared SES account automatically: per-tenant bounce/complaint tracking,
  suppression lists, send-rate guardrails, and **auto-disable of risky senders**.
- Support section for customers (tickets) and visibility for admins.

### Non-goals (v1)
- Per-customer dedicated IPs / SES sub-accounts (designed for, not built in v1 — see §10).
- Visual drag-and-drop email builder (v1 ships HTML + simple block templates; advanced
  builder is a later phase).
- Inbound mailbox / full webmail product (threading exists; not the focus of marketing v1).
- A/B testing, automation/drip journeys, SMS/WhatsApp (post-v1 backlog).

---

## 3. Personas

- **Super Admin (us):** operates the platform. Manages tenants, plans, billing,
  monitors SES health, handles abuse, resolves support tickets.
- **Tenant Admin (customer):** owns a customer account. Buys plans, manages domain,
  team users, contacts, templates, campaigns, billing, sees analytics.
- **Tenant User (customer's team member):** sends campaigns within the tenant's quota
  and permissions. (Role-scoped; optional in v1.)

---

## 4. Current state (what already exists)

| Area | Status | Notes |
|------|--------|-------|
| Tenant + User auth | ✅ | JWT, refresh, verify, reset, RBAC |
| Domain + DKIM/MAIL FROM via SES | ✅ | DNS records, verify, sending gates |
| Mailbox + inbox | ✅ | Stalwart integration, threads, compose |
| Single send + attachments | ✅ | SESv2, quota gate |
| Billing / plans / quota | ✅ | Direct, Stripe, Razorpay |
| Super admin panel | ✅ | Tenants, MRR, refunds, impersonate |
| Contacts / lists / CSV | ✅ | Import/export, consent, suppression |
| Templates | ✅ | Blocks, import/export, test-send |
| Campaigns (bulk send) | ✅ | BullMQ, schedule, SES stats |
| Analytics | ✅ | Tenant + admin dashboards |
| SES reputation guardrails | ✅ | Auto-pause, suppressions, kill switch |
| Support / tickets | ✅ | Attachments, canned replies, assignee |
| **Prod SNS/SES wiring** | 🟡 | Manual AWS — see SNS-PRODUCTION-SETUP.md |

---

## 5. Feature requirements

### 5.1 Accounts, auth & onboarding
- Email/password registration creating a Tenant + Tenant Admin (exists; harden it).
- Email verification on signup; password reset; JWT refresh; rate-limited auth.
- Onboarding checklist: verify domain → buy plan → import contacts → send first campaign.
- Roles: Super Admin, Tenant Admin, Tenant User (RBAC middleware).

### 5.2 Domain connection & sender identity (enhance existing)
- Add domain → show DKIM/SPF/DMARC + MAIL FROM (custom return-path) records.
- Poll SES for verification; mark domain `active` only when verified for sending.
- **Require DMARC and a custom MAIL FROM** before allowing campaigns (reputation hygiene).
- Block sending from unverified domains.

### 5.3 Plans & billing
- Super admin creates **Plans**: name, monthly price, **monthly email quota**, max
  contacts, max domains, max team users, attachment size cap, feature flags.
- Tenant buys/upgrades/downgrades/cancels a plan via the billing provider.
- **Billing provider is an abstraction (`BillingProvider` interface)**; concrete
  adapter (Razorpay or Stripe) chosen at implementation. Subscriptions + webhooks
  (payment success/failure, renewal, cancellation) update subscription state.
- Transactions/invoices recorded per tenant; visible to tenant and super admin.
- On renewal, **quota resets**; on payment failure, account moves to `past_due` then
  `suspended` per a grace policy.

### 5.4 Quota & usage enforcement (hard gate)
- Each tenant has a usage counter for the current billing period.
- **Every send (single or campaign) atomically checks and decrements remaining quota.**
  When quota is exhausted, sends are blocked with a clear upsell message.
- Campaign pre-flight: if recipients > remaining quota, block/partial-send per policy
  (v1: block with clear message, suggest upgrade).
- Usage visible in dashboard: sent / remaining / resets-on date.

### 5.5 Contacts, lists & CSV
- Contact model: email, name, custom fields, status (subscribed/unsubscribed/bounced/
  complained), tags, source.
- Lists/segments; add/remove contacts; tag-based filtering.
- **CSV import** with column mapping, validation, dedupe, and a per-row error report.
- **CSV export** of contacts/lists.
- **Suppression-aware:** importing never re-subscribes globally suppressed addresses
  (bounced/complained); those are skipped and flagged.

### 5.6 Templates
- HTML templates (paste/edit HTML) + a small set of reusable block templates.
- Merge tags/personalization (e.g. `{{first_name}}`), with safe defaults.
- Template preview + send-test-to-self.
- Save, duplicate, version; import/export template HTML.

### 5.7 Campaigns (bulk sending)
- Create campaign: choose list/segment, template, subject, from-identity, attachments.
- Pre-flight checks: domain verified, quota sufficient, suppression filtered,
  per-recipient personalization valid.
- Send now or **schedule**; throttled queue worker respects SES max send rate.
- **Mandatory unsubscribe link** injected into every marketing email (List-Unsubscribe
  header + footer link). Sending without it is blocked.
- Per-campaign stats: sent, delivered, bounced, complained, opened, clicked, unsub.

### 5.8 Single send & threading (keep existing)
- Keep transactional/conversational single-send + Gmail-style threads.
- Route single sends through the same quota + suppression checks.

### 5.9 Analytics
- **Tenant dashboard:** quota used/remaining/reset date, sends over time, delivery rate,
  bounce rate, complaint rate, open/click rate, top campaigns, unsubscribes.
- **Reputation health widget** per tenant (their bounce/complaint trend vs. thresholds)
  so customers self-correct before we have to intervene.
- **Super admin dashboard:** account-wide SES health (bounce %, complaint %, daily send
  vs. SES quota), per-tenant risk ranking, revenue/MRR, active subscriptions.

### 5.10 Support
- Tenant: create/view support tickets (subject, message, attachments, status).
- Super admin: ticket queue, assign, reply, resolve; canned responses.
- System notices surfaced to tenants (e.g. "your account was paused — reason").

### 5.11 Super admin panel
- Manage tenants: view, search, suspend/enable, impersonate (audited), adjust quota.
- Manage plans and pricing.
- View transactions, refunds (provider-side), invoices, MRR.
- **SES control center:** account-wide reputation, per-tenant bounce/complaint, manual
  override of auto-suspensions, suppression list management, send-pause kill switch.
- Audit log of admin actions.

---

## 6. SES reputation protection (P0 — the core safety system)

> Single shared SES account. AWS review triggers: account bounce rate ≥ 5%,
> complaint rate ≥ 0.1%. Either can pause sending for **all** customers. This section
> is non-negotiable for launch.

### 6.1 SES configuration
- One **configuration set per tenant** (within our single account) so each tenant's
  events are isolated and attributable. This is the cheap precursor to dedicated IP
  pools later — design for it now.
- Enable SES **event publishing** (sends, deliveries, bounces, complaints, rejects,
  opens, clicks) via SNS/Firehose into our pipeline.
- Use a **custom MAIL FROM** + DMARC per tenant domain (set in §5.2).

### 6.2 Suppression & bounce/complaint handling
- Maintain a **global suppression list** (our account-level) AND per-tenant suppression.
- On hard bounce or complaint: immediately suppress that address globally, mark contact
  `bounced`/`complained`, and never send to it again from any tenant.
- Distinguish hard vs. soft bounces; soft bounces get limited retries then suppression.
- Honor AWS account-level suppression list.

### 6.3 Per-tenant guardrails & rate limiting
- Track rolling **bounce rate** and **complaint rate** per tenant over a trailing window.
- **Per-tenant thresholds stricter than AWS account limits** (early warning), e.g.
  warn at bounce 3% / complaint 0.05%, auto-pause at bounce 5% / complaint 0.1%.
- Per-tenant send-rate cap; global send-rate limiter never exceeds SES max send rate.
- New/unwarmed tenants get a **conservative daily cap** that ramps as they prove
  good behavior (reputation warm-up).
- **List hygiene gates:** block campaigns to lists with a high proportion of role
  addresses, syntactically invalid addresses, or previously-bounced addresses.

### 6.4 Auto-disable risky accounts
- A monitoring worker continuously evaluates each tenant's metrics.
- On threshold breach: **automatically pause the tenant's sending**, mark account
  `restricted`, notify the tenant + super admin with the reason, and require review.
- Account-wide **kill switch**: if our aggregate bounce/complaint approaches AWS
  thresholds, auto-throttle or pause the highest-risk tenants first to protect the
  account, before AWS acts.
- All auto-actions are logged and reversible by super admin.

### 6.5 Compliance
- Mandatory unsubscribe (List-Unsubscribe + one-click) on all marketing email.
- Honor unsubscribes instantly and globally for that tenant.
- Block known disposable/spam-trap patterns where detectable.
- Consent/source tracking on imported contacts.

---

## 7. Data model additions (high level)

Existing: `Tenant`, `User`, `Domain`, `Mailbox`, `EmailThread`, `EmailThreadMessage`,
`EmailEvent`.

New:
- `Plan` — pricing, quotas, limits, feature flags.
- `Subscription` — tenant ↔ plan, status (`active`/`past_due`/`canceled`/`suspended`),
  current period, provider refs.
- `Transaction` / `Invoice` — billing history.
- `UsageCounter` — per-tenant period usage (sent, remaining, reset date).
- `Contact`, `ContactList`, `ListMembership` — audience.
- `Suppression` — global + per-tenant suppressed addresses with reason.
- `Template` — HTML/blocks, merge tags, versions.
- `Campaign` + `CampaignRecipient` — campaign config + per-recipient delivery state.
- `ReputationMetric` — rolling per-tenant bounce/complaint/delivery aggregates.
- `SupportTicket` + `TicketMessage`.
- `AuditLog` — admin/system actions.
- Extend `Tenant.status` enum: `active`, `restricted`, `past_due`, `suspended`.

---

## 8. Architecture & infra notes
- Stack stays: Node/Express + MongoDB backend, Next.js/TS/Tailwind frontend.
- Add a **queue/worker** (BullMQ + Redis) for: campaign sending (throttled), SES event
  ingestion, reputation evaluation, scheduled campaigns, and grace/suspension jobs.
- SES events via SNS → webhook/queue → metric aggregation.
- Idempotent webhook handling; signed webhook verification (SES SNS + billing provider).
- Secrets via env/secret manager; no AWS keys client-side.

---

## 9. Phased delivery — see `docs/ROADMAP.md`
MVP-first. The first sellable release is **billing + quota enforcement + SES safety**,
because without those we cannot charge money or safely send at scale.

---

## 10. Future (designed-for, not in v1)
- Dedicated IP pools per high-volume tenant (config sets already isolate them).
- Visual drag-and-drop email builder.
- Automation/drip journeys, A/B testing.
- Per-customer SES sub-accounts for full reputation isolation.
- Multi-region SES failover.

---

## 11. Open questions / decisions needed before/with build
1. Billing provider final pick (Razorpay vs Stripe) — abstraction lets us defer, but
   webhooks/subscription nuances differ; decide before Phase 2.
2. Exact plan tiers & prices (quota, contacts, domains, price in INR/USD).
3. Grace-period policy on payment failure (days before suspend).
4. Exact per-tenant reputation thresholds + warm-up ramp schedule.
5. Overage policy when quota exhausted mid-campaign (hard block vs. partial).
