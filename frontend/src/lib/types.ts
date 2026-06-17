export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed';

export interface DnsRecord {
  _id?: string;
  type: string;
  host: string;
  value: string;
  purpose: string;
  verified: boolean;
}

export interface Domain {
  _id: string;
  name: string;
  status: DomainStatus;
  dnsRecords: DnsRecord[];
  sesIdentityArn?: string;
  createdAt: string;
}

export interface Mailbox {
  _id: string;
  address: string;
  displayName?: string;
  domainId: string | { _id: string; name: string; status: DomainStatus };
  quotaMb: number;
  status: string;
  stalwartPrincipalId?: string;
  stalwartLinked?: boolean;
}

export interface EmailEvent {
  _id: string;
  messageId: string;
  eventType: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

/** Conversation thread (Gmail-style grouping). */
export interface EmailThread {
  _id: string;
  mailboxId: string;
  subject: string;
  snippet: string;
  counterpartyEmail?: string;
  lastActivityAt: string;
  lastDirection: 'inbound' | 'outbound';
  messageCount: number;
}

export interface MessageAttachment {
  filename: string;
  contentType: string;
  size: number;
}

/** Single message inside a thread (sent or received). */
export interface ThreadMessage {
  _id: string;
  threadId: string;
  direction: 'inbound' | 'outbound';
  fromAddress: string;
  toAddress: string;
  fromName?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  attachments?: MessageAttachment[];
  createdAt: string;
}

export type ThreadFilter = 'all' | 'inbox' | 'sent';

export interface User {
  _id: string;
  name: string;
  email: string;
  tenantId: string;
}

export type Role = 'super_admin' | 'admin' | 'user';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: Role;
  tenantId?: string;
  emailVerified?: boolean;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: SessionUser;
  tenant?: { id: string; name: string; slug: string };
}

export interface QuotaAddonPack {
  id: string;
  label: string;
  emails: number;
  priceMinor: number;
  currency: string;
}

export interface AccountOverview {
  tenant: { id: string; name: string; status: 'active' | 'suspended' | 'restricted' };
  subscription: {
    status: 'trialing' | 'active' | 'past_due' | 'canceled';
    planId: string | null;
    planName: string | null;
    monthlyEmailQuota: number;
    baseMonthlyQuota?: number;
    quotaBonusThisPeriod?: number;
    emailsSentThisPeriod: number;
    remaining: number | null;
    usedPct: number;
    periodStart: string;
    periodResetAt?: string;
    maxDomains: number;
    maxContacts: number;
  };
  sending: { paused: boolean; pauseReason: string; pauseSource: string };
  reputation: { sent: number; bounceRate: number; complaintRate: number };
  resources: {
    domains: number;
    activeDomains: number;
    mailboxes: number;
    contacts: number;
    campaignsSent: number;
  };
  features?: {
    inboundEmailEnabled: boolean;
  };
}

export interface Plan {
  _id: string;
  name: string;
  description?: string;
  priceMinor: number;
  currency: string;
  interval: 'month' | 'year';
  monthlyEmailQuota: number;
  maxContacts: number;
  maxDomains: number;
  maxTeamUsers: number;
  attachmentMb: number;
  features: string[];
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  stripePriceId?: string;
  razorpayPlanId?: string;
}

export interface BillingTransaction {
  _id: string;
  tenantId: string;
  planId?: string;
  provider: 'direct' | 'stripe' | 'razorpay';
  externalId?: string;
  amountMinor: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  description?: string;
  metadata?: { paymentId?: string; sessionId?: string; packId?: string };
  createdAt: string;
}

export interface AuditLogEntry {
  _id: string;
  actorEmail?: string;
  actorRole?: string;
  tenantId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  createdAt: string;
}

export interface SystemNotice {
  _id: string;
  tenantId: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  category: 'sending' | 'billing' | 'account' | 'maintenance' | 'admin';
  actionHref?: string;
  actionLabel?: string;
  createdAt: string;
}

export interface TenantSending {
  paused: boolean;
  pauseReason?: string;
  pauseSource?: '' | 'reputation' | 'manual' | 'quota';
  pausedAt?: string | null;
}

export interface TenantSubscription {
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  emailsSentThisPeriod: number;
  monthlyEmailQuota: number;
  periodStart: string;
}

export interface AdminTenant {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  sending?: TenantSending;
  subscription?: TenantSubscription;
}

export interface AdminBillingSettings {
  billing: {
    mode: 'direct' | 'provider';
    provider: 'stripe' | 'razorpay';
    source: 'platform' | 'env';
  };
  credentials: {
    stripeConfigured: boolean;
    razorpayConfigured: boolean;
  };
}

export interface PublicBillingConfig {
  mode: 'direct' | 'provider';
  provider: 'stripe' | 'razorpay';
  paymentsEnabled: boolean;
}

export interface PlatformProtectState {
  active?: boolean;
  lastEvaluatedAt?: string;
  lastPausedAt?: string;
  bounceRate?: number;
  complaintRate?: number;
  windowSent?: number;
  severityRatio?: number;
  triggerRatio?: number;
  pausedTenantIds?: string[];
  minSampleRequired?: number;
}

export interface TenantRiskRow {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  sendingPaused: boolean;
  pauseSource: string;
  sent: number;
  bounceRate: number;
  complaintRate: number;
  riskScore: number;
}

export interface AdminOverview {
  tenants: { total: number; active: number; suspended: number; paused: number };
  users: number;
  domains: number;
  plans: number;
  ses: {
    bounceRate: number | null;
    complaintRate: number | null;
    dailySent: number | null;
    sendQuota: number | null;
    windowSent?: number;
    platformHalted?: boolean;
    limits?: { bounceRate: number; complaintRate: number };
    platformProtect?: PlatformProtectState | null;
    account?: SesAccount | null;
    usage?: {
      monthToDateSent: number;
      estimatedCostUsd: number;
      costPer1000Usd: number;
      currency: string;
    };
  };
}

export interface PlatformDailyUsage {
  count: number;
  limit: number;
  remaining: number | null;
  windowStart: string | null;
  exceeded: boolean;
}

export interface SesAccount {
  max24HourSend: number | null;
  maxSendRate: number | null;
  sentLast24Hours: number | null;
  productionAccessEnabled: boolean;
  sendingEnabled: boolean;
  enforcementStatus: string | null;
}

export interface RevenueBreakdown {
  lifetimeByCurrency: { currency: string; grossMinor: number; refundedMinor: number; netMinor: number; count: number }[];
  thisMonthByCurrency: { currency: string; grossMinor: number; count: number }[];
  byMonth: { month: string; currency: string; grossMinor: number; count: number }[];
}

export interface PlanDistributionRow {
  planId: string;
  name: string;
  priceMinor: number;
  currency: string;
  interval: 'month' | 'year';
  isActive: boolean;
  activeTenants: number;
  lifetimeRevenueMinor: number;
  lifetimePurchases: number;
  thisMonthRevenueMinor: number;
}

export interface TopCustomer {
  rank: number;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  netRevenueMinor: number;
  currency: string;
  purchases: number;
}

export interface AdminTenantDetail {
  tenant: AdminTenant;
  users: { _id: string; name: string; email: string; role: Role; createdAt: string }[];
  domains: { _id: string; name: string; status: DomainStatus; createdAt: string }[];
  reputation: {
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
    bounceRate: number;
    complaintRate: number;
    windowStart: string;
  };
}

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'bounced' | 'complained';

export interface Contact {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  status: ContactStatus;
  consent?: string;
  tags: string[];
  source: string;
  listIds: string[];
  createdAt: string;
}

export interface ContactList {
  _id: string;
  name: string;
  description?: string;
  contactCount?: number;
  createdAt: string;
}

export interface ContactStats {
  total: number;
  subscribed: number;
  lists: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  suppressed: number;
  errors: { row: number; email: string; reason: string }[];
}

export interface Template {
  _id: string;
  name: string;
  subject: string;
  htmlBody: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'canceled' | 'failed';

export interface Campaign {
  _id: string;
  name: string;
  subject: string;
  templateId: string | { _id: string; name: string; subject?: string };
  listId: string | { _id: string; name: string };
  status: CampaignStatus;
  scheduledAt?: string | null;
  sentAt?: string | null;
  stats: {
    total: number;
    sent: number;
    delivered: number;
    bounced: number;
    complained: number;
  };
  preflightNotes: string[];
  createdAt: string;
}

export interface CampaignPreflight {
  ok: boolean;
  notes: string[];
  recipientCount: number;
  remaining: number | null;
}

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface TicketAttachment {
  filename: string;
  contentType: string;
  content: string;
  sizeBytes?: number;
}

export interface TicketMessage {
  _id: string;
  authorId: string;
  authorRole: 'tenant' | 'admin';
  body: string;
  attachments?: TicketAttachment[];
  createdAt: string;
}

export interface SupportTicket {
  _id: string;
  subject: string;
  status: TicketStatus;
  assigneeId?: string | null;
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
  tenant?: { name: string; slug: string };
}

export interface TeamUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified?: boolean;
  createdAt: string;
}

export interface BlockTemplate {
  id: string;
  name: string;
  subject: string;
  description: string;
  htmlBody: string;
}

export interface CannedResponse {
  id: string;
  label: string;
  body: string;
}

export interface AdminAnalytics {
  mrrMinor: number;
  currency: string;
  subscriptions: { active: number; pastDue: number; canceled: number };
  revenue: {
    thisMonthMinor: number;
    prevMonthMinor: number;
    txCountThisMonth: number;
  };
  cohort30d: { newTenants: number; newUsers: number };
}

export interface AccountAnalytics {
  reputation: { sent: number; bounceRate: number; complaintRate: number };
  events: Record<string, number>;
  sendVolume: { date: string; count: number }[];
  topCampaigns: Campaign[];
  contacts: number;
  quota: { used: number; total: number };
}
