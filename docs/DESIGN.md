# Design System — Mail Box

**Companion docs:** [`PRD.md`](./PRD.md) · [`ROADMAP.md`](./ROADMAP.md) · [`BUILD-STATUS.md`](./BUILD-STATUS.md)
**Last updated:** 2026-05-31
**Applies to:** Landing page, Tenant (customer) dashboard, Super-admin panel
**Stack it must fit:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4

This is the single source of truth for visual design. Every screen we build references the
tokens here — no ad-hoc hex codes, no one-off spacing. The goal is a product that looks like
Linear / Vercel / Stripe-tier SaaS: clean, fast, confident, with motion that *means something*.

---

## 1. Design principles

1. **Clarity over decoration.** Data and actions first. Remove anything that doesn't serve a task.
2. **One accent, used sparingly.** Neutral foundation + a single brand accent for primary actions and "live/healthy" states. High contrast, low frequency.
3. **Soft, modern surfaces.** Rounded cards, subtle borders, gentle shadows. No heavy skeuomorphism, no harsh full-black.
4. **Motion that communicates.** Animate to show state change, hierarchy, or feedback — never as filler. Only `transform` + `opacity` (GPU-friendly).
5. **Dark-mode-first, light fully supported.** Tokens drive both; never hardcode a color that breaks a theme.
6. **Accessible by default.** WCAG AA contrast (4.5:1 text), visible focus rings, keyboard nav, `prefers-reduced-motion` respected.
7. **Consistency is the brand.** Two font families max, one type scale, one spacing scale, one radius scale.

---

## 2. Tooling & libraries (decided)

| Concern | Choice | Why |
|--------|--------|-----|
| Styling | **Tailwind CSS 4** (already in repo) | Token-driven, theme via CSS variables, zero-runtime |
| Components | **shadcn/ui** (Radix + Tailwind) | Copy-paste, fully ownable, accessible, 2026 default for new SaaS |
| Primitives | **Radix UI** (via shadcn) | Headless a11y for menus, dialogs, popovers, tabs |
| Dashboard/charts | **Tremor** (or Recharts) | Tailwind-native charts/KPIs for analytics screens |
| Icons | **lucide-react** | Consistent, lightweight, matches shadcn |
| Motion | **Framer Motion** | Declarative, layout animations, respects reduced-motion |
| Heavy timeline motion (landing only) | **GSAP** (optional) | Scroll-driven hero sequences if needed |
| Fonts | **Inter (variable)** UI + **Geist** display option | Variable fonts enable kinetic type, single file |
| Tables | **TanStack Table** + shadcn `data-table` | Sorting/filtering for admin + contacts lists |
| Notifications | **sonner** (shadcn toast) | Non-blocking feedback |

> Why shadcn over MUI/Chakra: we own the component code (lives in our repo), it's Tailwind-4
> native, and customization is trivial — critical for a sellable, white-labelable product.

---

## 3. Color system

Colors are defined as **CSS variables in `oklch`** (Tailwind 4 native) so light/dark themes swap
by changing variable values, not class names. Tailwind classes reference semantic tokens
(`bg-background`, `text-muted-foreground`, `border-border`), never raw hex.

### 3.1 Brand palette

| Token | Use | Light | Dark |
|------|-----|-------|------|
| **Primary / Brand** | Indigo–violet `#6366F1` | primary buttons, links, active nav | slightly lighter for contrast |
| **Accent (healthy/live)** | Emerald `#10B981` | success, "delivered", healthy SES status | same |
| **Warning** | Amber `#F59E0B` | quota low, soft bounce, at-risk reputation | same |
| **Danger** | Rose/Red `#EF4444` | hard bounce, complaint, suspended, destructive actions | same |
| **Info** | Sky `#0EA5E9` | neutral notices | same |

> Rationale: an indigo/violet primary reads as trustworthy + modern SaaS (Linear/Stripe family),
> while emerald as the "healthy" semantic is ideal for a deliverability product where customers
> watch bounce/complaint health constantly.

### 3.2 Neutrals (foundation)

Slate-based neutral ramp. Backgrounds are **near-black, not pure black** (dark) and
**near-white, not pure white** (light) to reduce eye strain.

| Token | Light value | Dark value |
|-------|-------------|------------|
| `--background` | `oklch(0.99 0 0)` (#FAFAFA) | `oklch(0.17 0.01 260)` (~#0B0D12) |
| `--foreground` | `oklch(0.21 0.02 260)` (#1A1D24) | `oklch(0.95 0 0)` (#F2F3F5) |
| `--card` | `#FFFFFF` | `oklch(0.21 0.01 260)` (~#14161C) |
| `--muted` | `#F1F5F9` | `oklch(0.27 0.01 260)` |
| `--muted-foreground` | `#64748B` | `#94A3B8` |
| `--border` | `#E2E8F0` | `oklch(0.30 0.01 260)` |
| `--ring` (focus) | primary @ 50% | primary @ 60% |

### 3.3 Semantic status colors (deliverability domain)

These map directly to product states so the UI language is consistent everywhere:

| State | Color token | Where |
|-------|-------------|-------|
| Delivered / Verified / Active / Healthy | Emerald | domain status, send results, SES health |
| Pending / Sending / Warming up | Sky | domain verifying, queued campaign |
| Quota low / Soft bounce / At-risk | Amber | usage bar, reputation widget |
| Hard bounce / Complaint / Suspended / Restricted | Red | events, account status, kill switch |
| Unsubscribed / Suppressed / Inactive | Slate (muted) | contacts, suppression list |

### 3.4 `globals.css` token block (drop-in)

```css
@import "tailwindcss";

@theme {
  --radius: 0.625rem;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Geist", "Inter", sans-serif;
}

:root {
  --background: oklch(0.99 0 0);
  --foreground: oklch(0.21 0.02 260);
  --card: oklch(1 0 0);
  --card-foreground: var(--foreground);
  --primary: oklch(0.58 0.20 277);        /* indigo-violet */
  --primary-foreground: oklch(0.98 0 0);
  --accent: oklch(0.70 0.16 162);         /* emerald */
  --muted: oklch(0.96 0.01 260);
  --muted-foreground: oklch(0.55 0.02 260);
  --border: oklch(0.92 0.01 260);
  --ring: oklch(0.58 0.20 277);
  --destructive: oklch(0.62 0.22 25);     /* red */
  --warning: oklch(0.75 0.16 70);         /* amber */
  --success: oklch(0.70 0.16 162);        /* emerald */
}

.dark {
  --background: oklch(0.17 0.01 260);
  --foreground: oklch(0.95 0 0);
  --card: oklch(0.21 0.01 260);
  --primary: oklch(0.64 0.19 277);
  --muted: oklch(0.27 0.01 260);
  --muted-foreground: oklch(0.70 0.02 260);
  --border: oklch(0.30 0.01 260);
  --ring: oklch(0.64 0.19 277);
}
```

---

## 4. Typography

Two families only. **Inter** (variable) for everything UI; **Geist** optional for big landing
display headlines. Variable fonts let us do kinetic headline animation on the landing page with
a single file.

### Type scale (1.25 ratio, rem)

| Token | Size / line-height | Weight | Use |
|-------|--------------------|--------|-----|
| `display` | 3.5rem / 1.05 | 700 | landing hero only |
| `h1` | 2.25rem / 1.15 | 700 | page titles |
| `h2` | 1.75rem / 1.2 | 600 | section headers |
| `h3` | 1.375rem / 1.3 | 600 | card titles |
| `body-lg` | 1.125rem / 1.6 | 400 | lead paragraphs |
| `body` | 1rem / 1.6 | 400 | default text |
| `sm` | 0.875rem / 1.5 | 400 | secondary, table cells |
| `xs` | 0.75rem / 1.4 | 500 | labels, badges, captions |
| `mono` | 0.875rem | 400 | DNS records, API keys, code — use **Geist Mono** |

Rules: max **2–3** weights in use (400/500/600/700). Body text never below 14px. Headlines use
tight tracking (`-0.02em`); all-caps labels use `+0.05em`.

---

## 5. Spacing, radius, elevation

- **Spacing scale (4px base):** 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Use Tailwind `gap`/`p`/`m` steps only.
- **Radius:** `--radius` = 10px base. Buttons/inputs 8px, cards 12px, modals 16px, pills/badges full.
- **Borders:** 1px, `--border` token. Dark mode leans on borders more than shadows.
- **Elevation (shadows):** keep subtle.
  - `sm`: `0 1px 2px rgb(0 0 0 / 0.05)` — inputs, resting cards
  - `md`: `0 4px 12px rgb(0 0 0 / 0.08)` — dropdowns, popovers
  - `lg`: `0 12px 32px rgb(0 0 0 / 0.12)` — modals
  - In dark mode, reduce shadow opacity ~40% and rely on `--border` + a subtle inner highlight.

---

## 6. Core components

### Buttons

| Variant | Style | Use |
|---------|-------|-----|
| **Primary** | solid primary bg, white text, `radius 8`, hover darken 6%, active scale 0.98 | main CTA per view (one only) |
| **Secondary** | `bg-muted`, foreground text, border | secondary actions |
| **Outline** | transparent, `border-border`, hover `bg-muted` | tertiary |
| **Ghost** | transparent, hover `bg-muted` | toolbar/icon actions |
| **Destructive** | red bg/text, confirm dialog required | delete, suspend, kill switch |
| **Link** | primary text, underline on hover | inline nav |

Sizes: `sm` (h-8), `default` (h-10), `lg` (h-12). Always show **loading spinner + disabled**
state on async actions. Icon buttons are square with `aria-label`.

### Form controls
Inputs: h-10, `radius 8`, `border-border`, focus = 2px `--ring` + subtle glow. Always pair with a
label and helper/error text. Error state: red border + red helper. Use shadcn `Form` + `zod`
validation for every form.

### Cards
`bg-card`, `border-border`, `radius 12`, `shadow-sm`, padding 20–24px. Card header = `h3` + optional
action on the right. Use for dashboard KPIs, settings groups, campaign summaries.

### Badges / status pills
Full-radius, `xs` text, soft tinted background of the semantic color (e.g. emerald-100 bg /
emerald-700 text in light, inverted in dark). Drive directly from §3.3 states.

### Tables (admin, contacts, events)
TanStack + shadcn data-table: sticky header, zebra-free with row hover `bg-muted/50`, sortable
columns, pagination, sticky bulk-action bar on selection, empty-state illustration. Dense mode
toggle for power users (super admin).

### Navigation
- **App shell:** fixed left sidebar (collapsible to icons), top bar with search + account menu +
  theme toggle + notifications. Dark sidebar / light content is acceptable but prefer
  token-driven so it themes cleanly.
- **Super-admin** gets a visually distinct accent strip / "Admin" badge so operators never confuse
  it with a tenant view.

### Feedback
- **Toasts (sonner):** success/error/info, top-right, auto-dismiss, with action where relevant.
- **Empty states:** icon + one line + primary CTA (e.g. "No campaigns yet → Create campaign").
- **Skeletons:** shimmer placeholders for any data fetch > 300ms.
- **Confirm dialogs:** required for destructive/irreversible actions (suspend tenant, delete list,
  trigger kill switch) — type-to-confirm for the most dangerous ones.

---

## 7. Motion & animation

Principle: **subtle motion that adds meaning, not noise.** Animate only `transform` and `opacity`.

| Pattern | Spec |
|---------|------|
| Durations | micro 120ms · standard 200ms · large/overlay 280ms |
| Easing | `ease-out` for enter, `ease-in` for exit; springs for playful landing only |
| Buttons | hover 120ms color, active `scale(0.98)` |
| Cards/lists | stagger fade+`translateY(8px)` on mount, 40ms stagger |
| Modals/sheets | overlay fade + content scale `0.96→1` |
| Page transitions | 200ms fade; avoid full-page slides in app |
| Number/KPI | count-up on first paint (dashboard metrics) |
| Charts | animate-in on view, draw line/bars left→right |
| Landing hero | kinetic headline (variable-font weight/letters), scroll-reveal sections, animated product mock |
| **Reduced motion** | honor `prefers-reduced-motion`: disable transforms, keep instant opacity |

Framer Motion `<motion.div>` for component-level; reserve GSAP for landing scroll timelines only.

---

## 8. Landing page blueprint

Order proven to convert for B2B SaaS in 2026:

1. **Hero** — headline **< 8 words** showing the transformation ("Send marketing email that lands."), subhead one line, primary CTA + secondary "See pricing", animated product/dashboard mock. Value clear in 3–5s.
2. **Logo / trust strip** — "trusted by" or volume stat (emails delivered).
3. **Problem → solution** — 3 micro-animated feature blocks (deliverability, campaigns, analytics).
4. **Product showcase** — annotated screenshots/looping clips of dashboard + campaign builder.
5. **Deliverability angle** — our differentiator: "We protect your sender reputation" (bounce/complaint guardrails). This is the moat — feature it.
6. **Pricing** — plan cards, highlight recommended tier, monthly quota front and center.
7. **Social proof** — testimonials + metrics.
8. **FAQ** — accordion (shadcn).
9. **Final CTA** — single strong conversion block.
10. **Footer** — links, status page, legal, contact.

Performance is a design feature: target LCP < 2.5s, lazy-load below-fold media, ship the hero
critical CSS inline.

---

## 9. Dashboard & admin layout patterns

- **Tenant dashboard home:** top row = KPI cards (Emails sent, Remaining quota with progress bar,
  Delivery rate, **Reputation health** badge). Below: send-volume chart, recent campaigns table,
  onboarding checklist (until complete).
- **Quota bar** is a signature element: a prominent progress bar that turns amber < 20% remaining,
  red at 0, with an inline "Upgrade" CTA.
- **Reputation widget:** small gauge/sparkline of bounce % and complaint % vs threshold lines,
  green/amber/red. Customers self-correct before we auto-pause them.
- **Super-admin SES control center:** account-wide bounce/complaint gauges against AWS limits
  (5% / 0.1%) with clear danger zones, per-tenant risk-ranked table (sortable by risk), and a
  guarded **kill switch** (red, type-to-confirm).
- **Consistent page template:** breadcrumb + page title + primary action (top right) + content.

---

## 10. Accessibility & quality checklist (every screen)

- [ ] Text contrast ≥ 4.5:1 (3:1 for large text) in **both** themes
- [ ] Visible focus ring on all interactive elements
- [ ] Full keyboard navigation; logical tab order; ESC closes overlays
- [ ] All icons/icon-buttons have `aria-label`
- [ ] Forms: labels, inline validation, error summary
- [ ] `prefers-reduced-motion` respected
- [ ] Loading, empty, and error states designed (not just the happy path)
- [ ] Works at 320px → 1440px+; admin tables scroll gracefully on mobile
- [ ] No raw hex — semantic tokens only

---

## 11. Implementation order (ties to ROADMAP)

1. **Foundation:** install shadcn/ui + Tailwind 4 token block (§3.4), fonts, theme toggle, motion utils. Build the app shell (sidebar + topbar) and primitives (Button, Card, Input, Badge, Table, Dialog, Toast).
2. **Phase 1 screens:** plans/billing, quota bar, super-admin tenant table + SES control center — using the tokens above.
3. **Phase 2+:** contacts/CSV, template editor, campaign builder, analytics (Tremor charts).
4. **Landing page:** build last-ish but before launch, using §8 blueprint.

---

## Sources / references
- shadcn/ui · Radix UI · Tremor · Framer Motion · Tailwind CSS 4 docs
- 2026 SaaS dashboard & landing-page trend research (Muzli, SaaSFrame, Untitled UI, JetBase) — see chat for links.
