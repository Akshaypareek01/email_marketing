'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Plan } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Scroll-reveal: adds `.in-view` to every `.reveal` when it enters    */
/* ------------------------------------------------------------------ */
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Tiny inline icons (no dependency)                                   */
/* ------------------------------------------------------------------ */
type IconProps = { className?: string };
const I = {
  shield: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  send: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
  ),
  chart: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
  ),
  layers: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></svg>
  ),
  upload: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
  ),
  globe: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" /></svg>
  ),
  check: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  chevron: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" className={p.className} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  ),
};

/* ------------------------------------------------------------------ */
/*  Header                                                              */
/* ------------------------------------------------------------------ */
function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'border-b border-border/70 bg-white/80 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mail Box" className="h-8 w-8 rounded-[20px] object-cover shadow-sm" />
          <span className="text-lg font-bold tracking-tight">Mail Box</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#deliverability" className="transition hover:text-foreground">Deliverability</a>
          <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
          <a href="#faq" className="transition hover:text-foreground">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-semibold text-foreground transition hover:text-[var(--primary)] sm:block">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--primary-600)] active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-24">
      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-300/40 via-violet-300/30 to-emerald-200/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--background)_75%)]" />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <div className="animate-fade-in mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          Reputation-safe by design
        </div>

        <h1 className="animate-fade-up text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          Send marketing email
          <br className="hidden sm:block" />
          that actually <span className="gradient-text">lands.</span>
        </h1>

        <p className="animate-fade-up mx-auto mt-6 max-w-xl text-lg text-muted-foreground" style={{ animationDelay: '0.08s' }}>
          Connect your domain, import contacts, and run campaigns through enterprise-grade
          infrastructure — with built-in guardrails that protect your sender reputation.
        </p>

        <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: '0.16s' }}>
          <Link
            href="/register"
            className="rounded-xl bg-[var(--primary)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-[var(--primary-600)] active:scale-[0.98]"
          >
            Start sending free
          </Link>
          <a
            href="#pricing"
            className="rounded-xl border border-border bg-white px-7 py-3.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted active:scale-[0.98]"
          >
            See pricing
          </a>
        </div>

        <p className="animate-fade-in mt-5 text-xs text-muted-foreground" style={{ animationDelay: '0.3s' }}>
          No credit card required · Verify your domain in minutes
        </p>
      </div>

      {/* Product mock */}
      <div className="animate-fade-up mx-auto mt-16 max-w-5xl" style={{ animationDelay: '0.24s' }}>
        <DashboardMock />
      </div>
    </section>
  );
}

/* A lightweight, faux dashboard preview built with divs (no image asset needed) */
function DashboardMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-2xl shadow-slate-900/10">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 text-xs text-muted-foreground">app.mailbox.io / dashboard</span>
      </div>
      <div className="grid grid-cols-12">
        {/* sidebar */}
        <aside className="col-span-3 hidden border-r border-border bg-slate-50 p-4 sm:block">
          <div className="mb-4 h-3 w-20 rounded bg-slate-200" />
          {['Overview', 'Campaigns', 'Contacts', 'Templates', 'Analytics'].map((x, i) => (
            <div key={x} className={`mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${i === 0 ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-slate-500'}`}>
              <span className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-[var(--primary)]' : 'bg-slate-300'}`} />
              {x}
            </div>
          ))}
        </aside>
        {/* main */}
        <main className="col-span-12 p-5 sm:col-span-9">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KPI label="Emails sent" value="48,210" tone="primary" />
            <KPI label="Delivery rate" value="99.2%" tone="accent" />
            <KPI label="Bounce rate" value="0.4%" tone="accent" />
            <KPI label="Quota left" value="62%" tone="warning" />
          </div>
          {/* quota bar */}
          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold">Monthly quota</span>
              <span className="text-muted-foreground">31,000 / 50,000</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]" />
            </div>
          </div>
          {/* fake chart */}
          <div className="mt-4 rounded-xl border border-border p-4">
            <div className="mb-3 h-3 w-24 rounded bg-slate-200" />
            <div className="flex h-28 items-end gap-1.5">
              {[40, 55, 35, 70, 60, 85, 75, 95, 80, 100, 88, 92].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-[var(--primary)]/30 to-[var(--primary)]" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'accent' | 'warning' }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'warning' ? 'var(--warning)' : 'var(--primary)';
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trust strip                                                         */
/* ------------------------------------------------------------------ */
function TrustStrip() {
  return (
    <section className="border-y border-border bg-white/50 py-8">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Trusted infrastructure for high-volume senders
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 text-sm font-semibold text-slate-400">
          <span>10M+ emails delivered</span>
          <span className="hidden sm:inline">·</span>
          <span>99.2% inbox placement</span>
          <span className="hidden sm:inline">·</span>
          <span>SPF · DKIM · DMARC</span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features                                                            */
/* ------------------------------------------------------------------ */
const FEATURES = [
  { icon: I.globe, title: 'Domain in minutes', body: 'Add your domain and we generate the exact SPF, DKIM, DMARC and MAIL FROM records. We verify automatically before you send.' },
  { icon: I.upload, title: 'Contacts & CSV', body: 'Import lists with column mapping, dedupe and validation. Suppressed and bounced addresses are filtered out for you.' },
  { icon: I.layers, title: 'Templates that reuse', body: 'Build reusable HTML and block templates with merge tags. Preview, send a test, then ship to your whole list.' },
  { icon: I.send, title: 'Campaigns at scale', body: 'Schedule or send now. A throttled queue respects send limits so big campaigns go out smoothly, never in bursts.' },
  { icon: I.chart, title: 'Analytics that matter', body: 'Track delivery, opens, clicks, bounces and unsubscribes per campaign — plus quota usage at a glance.' },
  { icon: I.shield, title: 'Reputation guardrails', body: 'Automatic suppression, bounce/complaint monitoring and auto-pause keep your sender reputation — and ours — healthy.' },
];

function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="reveal mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to run email</h2>
          <p className="mt-4 text-lg text-muted-foreground">From domain setup to deliverability — one platform, no glue code.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="reveal group rounded-2xl border border-border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] transition group-hover:bg-[var(--primary)] group-hover:text-white">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Deliverability moat                                                 */
/* ------------------------------------------------------------------ */
function Deliverability() {
  const points = [
    'Hard bounces & complaints are auto-suppressed — never sent to again',
    'Per-account bounce and complaint rates monitored in real time',
    'Risky senders are auto-paused before they can hurt your domain',
    'Mandatory one-click unsubscribe on every marketing email',
  ];
  return (
    <section id="deliverability" className="bg-slate-950 px-6 py-24 text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        <div className="reveal">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-emerald-300">
            <I.shield className="h-3.5 w-3.5" /> Our differentiator
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            We protect your sender reputation
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Most platforms let you send until something breaks. Mail Box watches deliverability
            continuously and steps in automatically — so your emails keep landing in the inbox.
          </p>
          <ul className="mt-8 space-y-4">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <I.check className="h-3 w-3" />
                </span>
                <span className="text-sm text-slate-200">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* reputation gauge mock */}
        <div className="reveal rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">Reputation health</span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">Healthy</span>
          </div>
          {[
            { label: 'Bounce rate', val: 0.4, max: 5, unit: '%' },
            { label: 'Complaint rate', val: 0.02, max: 0.1, unit: '%' },
            { label: 'Delivery rate', val: 99.2, max: 100, unit: '%' },
          ].map((m) => (
            <div key={m.label} className="mb-4">
              <div className="mb-1.5 flex justify-between text-xs text-slate-300">
                <span>{m.label}</span>
                <span className="font-semibold text-white">{m.val}{m.unit}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${Math.min((m.val / m.max) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-400">Thresholds enforced below industry limits (5% bounce · 0.1% complaint).</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing                                                             */
/* ------------------------------------------------------------------ */
/** Plan card view-model used by the pricing grid. */
type PlanCard = {
  key: string;
  name: string;
  price: string;
  period: string;
  quota: string;
  features: string[];
  cta: string;
  highlight: boolean;
};

/** Fallback shown while plans load or if the API is unreachable. */
const STATIC_PLANS: PlanCard[] = [
  { key: 'Starter', name: 'Starter', price: '₹999', period: '/mo', quota: '8,000 emails / month', features: ['1 sending domain', '5,000 contacts', 'HTML & block templates', 'Basic analytics', 'Email support'], cta: 'Get started', highlight: false },
  { key: 'Growth', name: 'Growth', price: '₹2,999', period: '/mo', quota: '35,000 emails / month', features: ['3 sending domains', '25,000 contacts', 'Scheduled campaigns', 'Advanced analytics', 'Reputation dashboard', 'Priority support'], cta: 'Get started', highlight: true },
  { key: 'Pro', name: 'Pro', price: '₹7,999', period: '/mo', quota: '120,000 emails / month', features: ['10 sending domains', '100,000 contacts', 'Dedicated send pool', 'Team roles & RBAC', 'Custom DMARC support', 'Dedicated manager'], cta: 'Get started', highlight: false },
];

/** Format minor currency units as a clean, whole-number price (no decimals). */
function formatPlanPrice(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${Math.round(minor / 100)} ${currency.toUpperCase()}`;
  }
}

/** Derive human-readable feature bullets from a plan's limits + its feature list. */
function planFeatures(p: Plan): string[] {
  const limits = [
    p.maxDomains === 0 ? 'Unlimited sending domains' : `${p.maxDomains} sending domain${p.maxDomains > 1 ? 's' : ''}`,
    p.maxContacts === 0 ? 'Unlimited contacts' : `${p.maxContacts.toLocaleString('en-IN')} contacts`,
    p.maxTeamUsers === 0 ? 'Unlimited team members' : `${p.maxTeamUsers} team member${p.maxTeamUsers > 1 ? 's' : ''}`,
  ];
  if (p.attachmentMb) limits.push(`${p.attachmentMb} MB attachments`);
  return [...limits, ...(p.features ?? [])];
}

/** Map a DB plan to the pricing-card view-model. */
function toCard(p: Plan, index: number, total: number): PlanCard {
  return {
    key: p._id,
    name: p.name,
    price: formatPlanPrice(p.priceMinor, p.currency),
    period: p.interval === 'year' ? '/yr' : '/mo',
    quota: `${p.monthlyEmailQuota.toLocaleString('en-IN')} emails / month`,
    features: planFeatures(p),
    cta: 'Get started',
    // Spotlight the middle tier (e.g. Growth in a 3-plan lineup).
    highlight: total >= 3 && index === Math.floor(total / 2),
  };
}

function Pricing() {
  const [cards, setCards] = useState<PlanCard[]>(STATIC_PLANS);

  useEffect(() => {
    let active = true;
    api
      .listPublicPlans()
      .then((res) => {
        if (active && res.plans?.length) {
          setCards(res.plans.map((p, i) => toCard(p, i, res.plans.length)));
        }
      })
      .catch(() => {
        /* keep static fallback if the API is unreachable */
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="reveal mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, quota-based pricing</h2>
          <p className="mt-4 text-lg text-muted-foreground">Pick a monthly plan with the email quota you need. Upgrade any time.</p>
        </div>
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {cards.map((p) => (
            <div
              key={p.key}
              className={`relative flex flex-col rounded-2xl border p-7 transition hover:-translate-y-1 ${
                p.highlight
                  ? 'border-[var(--primary)] bg-white shadow-xl shadow-indigo-500/10 ring-1 ring-[var(--primary)]'
                  : 'border-border bg-white shadow-sm hover:shadow-lg'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-white shadow">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--accent)]">{p.quota}</p>
              <ul className="mt-6 flex-1 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <I.check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`mt-7 rounded-xl px-5 py-3 text-center text-sm font-semibold transition active:scale-[0.98] ${
                  p.highlight
                    ? 'bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-600)]'
                    : 'border border-border bg-white text-foreground hover:bg-muted'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="reveal mt-8 text-center text-xs text-muted-foreground">
          All plans include domain verification, suppression management and reputation guardrails.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Testimonial                                                         */
/* ------------------------------------------------------------------ */
function Testimonial() {
  return (
    <section className="px-6 py-20">
      <div className="reveal mx-auto max-w-3xl rounded-3xl border border-border bg-gradient-to-br from-indigo-50 to-emerald-50 p-10 text-center shadow-sm">
        <p className="text-xl font-medium leading-relaxed text-slate-800 sm:text-2xl">
          &ldquo;We switched to Mail Box and our inbox placement jumped overnight. The reputation
          guardrails mean we stopped worrying about getting our sending blocked.&rdquo;
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">A</div>
          <div className="text-left">
            <div className="text-sm font-semibold">Ankit Sharma</div>
            <div className="text-xs text-muted-foreground">Founder, GrowthList</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                 */
/* ------------------------------------------------------------------ */
const FAQS = [
  { q: 'How do I connect my domain?', a: 'Add your domain in the dashboard and we generate the exact SPF, DKIM, DMARC and MAIL FROM DNS records. Add them at your registrar and we verify automatically — usually within minutes.' },
  { q: 'What happens if I hit my monthly quota?', a: 'Sending pauses cleanly and we prompt you to upgrade. Your quota resets at the start of each billing cycle. No surprise overage charges.' },
  { q: 'How do you protect deliverability?', a: 'We auto-suppress hard bounces and complaints, monitor bounce/complaint rates continuously, and automatically pause risky senders before they can damage your domain reputation.' },
  { q: 'Can I import my existing contacts?', a: 'Yes — upload a CSV with column mapping and validation. We dedupe and filter out previously suppressed addresses so you stay compliant.' },
  { q: 'Do you support attachments and HTML templates?', a: 'Both. Build reusable HTML and block templates with merge tags, preview them, send a test, then ship to your whole list. Attachments up to 10 MB per email.' },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="reveal text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
        </div>
        <div className="reveal mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white">
          {FAQS.map((f, i) => (
            <div key={f.q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition hover:bg-muted/50"
                aria-expanded={open === i}
              >
                <span className="text-sm font-semibold">{f.q}</span>
                <I.chevron className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid overflow-hidden px-6 transition-all duration-300 ${open === i ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                           */
/* ------------------------------------------------------------------ */
function FinalCTA() {
  return (
    <section className="px-6 pb-24">
      <div className="reveal relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-[var(--primary)] px-8 py-16 text-center text-white shadow-2xl shadow-indigo-500/30">
        <div className="pointer-events-none absolute inset-0 opacity-30">
          <div className="absolute -left-10 top-0 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-emerald-300/30 blur-3xl" />
        </div>
        <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to send email that lands?</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-indigo-100">
          Set up your domain, import your list, and launch your first campaign today.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/register" className="rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-[var(--primary)] shadow-sm transition hover:bg-slate-100 active:scale-[0.98]">
            Start sending free
          </Link>
          <Link href="/login" className="rounded-xl border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                              */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-border bg-white px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Mail Box" className="h-7 w-7 rounded-[20px] object-cover" />
          <span className="font-bold">Mail Box</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Mail Box. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  useScrollReveal();
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <Features />
        <Deliverability />
        <Pricing />
        <Testimonial />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
