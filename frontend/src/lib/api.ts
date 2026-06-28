import type {
  Plan,
  AdminOverview,
  AdminTenant,
  AdminTenantDetail,
  AccountOverview,
  Contact,
  ContactList,
  ContactStats,
  ImportResult,
  Template,
  Campaign,
  CampaignPreflight,
  SupportTicket,
  AccountAnalytics,
  BillingTransaction,
  TicketStatus,
  AuthResponse,
  AuditLogEntry,
  SystemNotice,
  AdminAnalytics,
  BlockTemplate,
  CannedResponse,
  TeamUser,
  QuotaAddonPack,
  AdminBillingSettings,
  PublicBillingConfig,
  PlatformProtectState,
  TenantRiskRow,
  RevenueBreakdown,
  PlanDistributionRow,
  TopCustomer,
  PlatformDailyUsage,
} from './types';
import type { OutboundAttachment } from './attachments';
import { clearSession, getRefreshToken, getToken, setSession } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: unknown[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  retried = false
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const authToken = token ?? (typeof window !== 'undefined' ? getToken() : null);
  if (authToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (
    res.status === 401 &&
    !retried &&
    typeof window !== 'undefined' &&
    !path.startsWith('/auth/refresh') &&
    getRefreshToken()
  ) {
    try {
      const refreshed = await request<AuthResponse>(
        '/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken: getRefreshToken() }) },
        null,
        true
      );
      setSession(refreshed.token, refreshed.user, refreshed.refreshToken);
      return request<T>(path, options, refreshed.token, true);
    } catch {
      clearSession();
    }
  }

  if (!res.ok) {
    throw new ApiError(data.message || 'Request failed', res.status, data.errors);
  }

  return data as T;
}

async function fetchBlob(path: string, token: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      (data as { message?: string }).message || 'Request failed',
      res.status
    );
  }

  return res.blob();
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  register: (body: {
    name: string;
    email: string;
    password: string;
    tenantName: string;
    phoneCountryCode: string;
    phone: string;
  }) =>
    request<AuthResponse & { devVerifyCode?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  refreshAuth: (refreshToken: string) =>
    request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  logout: (refreshToken?: string) =>
    request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string; devResetCode?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (email: string, code: string, password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    }),

  verifyEmail: (token: string, code: string) =>
    request<{ message: string; email?: string }>(
      '/auth/verify-email',
      { method: 'POST', body: JSON.stringify({ code }) },
      token
    ),

  resendVerification: (token: string) =>
    request<{ message: string; devVerifyCode?: string }>(
      '/auth/resend-verification',
      { method: 'POST', body: JSON.stringify({}) },
      token
    ),

  me: (token: string) => request<{ user: unknown }>('/auth/me', {}, token),

  listDomains: (token: string) => request<{ domains: unknown[] }>('/domains', {}, token),

  getDomain: (token: string, id: string) =>
    request<{ domain: unknown }>(`/domains/${id}`, {}, token),

  createDomain: (token: string, name: string) =>
    request('/domains', { method: 'POST', body: JSON.stringify({ name }) }, token),

  verifyDomain: (token: string, id: string) =>
    request(`/domains/${id}/verify`, { method: 'POST' }, token),

  deleteDomain: (token: string, id: string) =>
    request(`/domains/${id}`, { method: 'DELETE' }, token),

  listMailboxes: (token: string, domainId?: string) => {
    const q = domainId ? `?domainId=${domainId}` : '';
    return request<{ mailboxes: unknown[] }>(`/mailboxes${q}`, {}, token);
  },

  createMailbox: (
    token: string,
    body: { domainId: string; localPart: string; displayName?: string; password?: string }
  ) => request('/mailboxes', { method: 'POST', body: JSON.stringify(body) }, token),

  deleteMailbox: (token: string, id: string) =>
    request(`/mailboxes/${id}`, { method: 'DELETE' }, token),

  syncMailboxInbox: (token: string, mailboxId: string) =>
    request<{ mailboxId: string; address: string; stats: Record<string, unknown> }>(
      `/mailboxes/${encodeURIComponent(mailboxId)}/sync-inbox`,
      { method: 'POST' },
      token
    ),

  linkMailboxCredentials: (token: string, mailboxId: string, password: string) =>
    request(`/mailboxes/${encodeURIComponent(mailboxId)}/credentials`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }, token),

  sendEmail: (
    token: string,
    body: {
      mailboxId: string;
      to: string;
      subject: string;
      html?: string;
      text?: string;
      threadId?: string;
      attachments?: { filename: string; contentType: string; content: string }[];
    }
  ) => request('/email/send', { method: 'POST', body: JSON.stringify(body) }, token),

  listEvents: (token: string) => request<{ events: unknown[] }>('/email/events', {}, token),

  /* ---------------------------- Account ---------------------------- */
  accountOverview: (token: string) => request<AccountOverview>('/account/overview', {}, token),

  listSystemNotices: (token: string) =>
    request<{ notices: SystemNotice[] }>('/account/notices', {}, token),

  dismissSystemNotice: (token: string, id: string) =>
    request<{ notice: SystemNotice }>(`/account/notices/${id}/dismiss`, { method: 'POST' }, token),

  accountAnalytics: (token: string) => request<AccountAnalytics>('/account/analytics', {}, token),

  /* ----------------------------- Billing --------------------------- */
  getBillingConfig: () =>
    request<PublicBillingConfig>('/billing/config'),

  billingCheckout: (token: string, planId: string) =>
    request<{
      mode: 'direct' | 'redirect';
      message?: string;
      checkoutUrl?: string;
      subscription?: { planId: string; planName: string; status: string; monthlyEmailQuota: number };
    }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) }, token),

  listBillingTransactions: (token: string) =>
    request<{ transactions: BillingTransaction[] }>('/billing/transactions', {}, token),

  billingCancel: (token: string) =>
    request<{ message: string; canceled: boolean }>('/billing/cancel', { method: 'POST', body: '{}' }, token),

  billingChangePlan: (token: string, planId: string) =>
    request<{
      mode: 'direct' | 'redirect' | 'updated';
      direction?: 'upgrade' | 'downgrade' | 'lateral';
      message?: string;
      checkoutUrl?: string;
    }>('/billing/change-plan', { method: 'POST', body: JSON.stringify({ planId }) }, token),

  listQuotaPacks: (token: string) =>
    request<{ packs: QuotaAddonPack[] }>('/billing/quota-packs', {}, token),

  buyQuotaAddon: (token: string, packId: string) =>
    request<{ mode: 'direct' | 'redirect'; message?: string; checkoutUrl?: string; pack?: QuotaAddonPack }>(
      '/billing/quota-addon',
      { method: 'POST', body: JSON.stringify({ packId }) },
      token
    ),

  /* ----------------------------- Plans ----------------------------- */
  listPublicPlans: () => request<{ plans: Plan[] }>('/plans/public'),

  listPlans: (token: string) => request<{ plans: Plan[] }>('/plans', {}, token),

  createPlan: (token: string, body: Partial<Plan>) =>
    request<{ plan: Plan }>('/plans', { method: 'POST', body: JSON.stringify(body) }, token),

  updatePlan: (token: string, id: string, body: Partial<Plan>) =>
    request<{ plan: Plan }>(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  deletePlan: (token: string, id: string) =>
    request<{ plan: Plan }>(`/plans/${id}`, { method: 'DELETE' }, token),

  /* -------------------------- Super admin -------------------------- */
  adminOverview: (token: string) => request<AdminOverview>('/admin/overview', {}, token),

  adminAnalytics: (token: string) =>
    request<{ analytics: AdminAnalytics }>('/admin/analytics', {}, token),

  adminRevenue: (token: string) =>
    request<{ revenue: RevenueBreakdown }>('/admin/analytics/revenue', {}, token),

  adminPlanDistribution: (token: string) =>
    request<{ plans: PlanDistributionRow[] }>('/admin/analytics/plans', {}, token),

  adminTopCustomers: (token: string, limit = 10) =>
    request<{ customers: TopCustomer[] }>(`/admin/customers/top?limit=${limit}`, {}, token),

  adminImpersonateTenant: (token: string, tenantId: string) =>
    request<AuthResponse & { impersonating: boolean; impersonatorId: string }>(
      `/admin/tenants/${tenantId}/impersonate`,
      { method: 'POST', body: '{}' },
      token
    ),

  adminSyncSuppressions: (token: string) =>
    request<{ synced: number; skipped?: number; message?: string }>(
      '/admin/suppressions/sync',
      { method: 'POST', body: '{}' },
      token
    ),

  adminListCannedResponses: (token: string) =>
    request<{ responses: CannedResponse[] }>('/admin/support/canned', {}, token),

  adminGetPlatformSettings: (token: string) =>
    request<{
      platformSendingHalted: boolean;
      platformProtect?: PlatformProtectState | null;
      dailyLimit?: number;
      dailyUsage?: PlatformDailyUsage;
    }>('/admin/platform', {}, token),

  adminSetPlatformHalt: (token: string, halted: boolean) =>
    request<{ platformSendingHalted: boolean }>(
      '/admin/platform/halt',
      { method: 'PATCH', body: JSON.stringify({ halted }) },
      token
    ),

  adminSetPlatformDailyLimit: (token: string, limit: number) =>
    request<{ dailyLimit: number; dailyUsage: PlatformDailyUsage }>(
      '/admin/platform/daily-limit',
      { method: 'PATCH', body: JSON.stringify({ limit }) },
      token
    ),

  adminReputationRisk: (token: string, limit = 25) =>
    request<{ ranking: TenantRiskRow[]; platformProtect: PlatformProtectState | null }>(
      `/admin/reputation/risk?limit=${limit}`,
      {},
      token
    ),

  adminRunReputationGuard: (token: string) =>
    request<{ result: Record<string, unknown> }>(
      '/admin/reputation/evaluate',
      { method: 'POST', body: '{}' },
      token
    ),

  adminGetBillingSettings: (token: string) =>
    request<AdminBillingSettings>('/admin/billing/settings', {}, token),

  adminUpdateBillingSettings: (
    token: string,
    body: { mode?: 'direct' | 'provider'; provider?: 'stripe' | 'razorpay' }
  ) =>
    request<AdminBillingSettings>(
      '/admin/billing/settings',
      { method: 'PATCH', body: JSON.stringify(body) },
      token
    ),

  adminAdjustTenantQuota: (token: string, tenantId: string, monthlyEmailQuota: number) =>
    request<{ tenant: AdminTenant }>(
      `/admin/tenants/${tenantId}/quota`,
      { method: 'PATCH', body: JSON.stringify({ monthlyEmailQuota }) },
      token
    ),

  adminListTenants: (token: string, params: { q?: string; status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    const s = qs.toString();
    return request<{ tenants: AdminTenant[]; total: number; page: number; limit: number }>(
      `/admin/tenants${s ? `?${s}` : ''}`,
      {},
      token
    );
  },

  adminGetTenant: (token: string, id: string) =>
    request<AdminTenantDetail>(`/admin/tenants/${id}`, {}, token),

  adminSetTenantStatus: (token: string, id: string, status: 'active' | 'suspended') =>
    request<{ tenant: AdminTenant }>(
      `/admin/tenants/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      token
    ),

  adminSetTenantSending: (token: string, id: string, paused: boolean, reason?: string) =>
    request<{ tenant: AdminTenant }>(
      `/admin/tenants/${id}/sending`,
      { method: 'PATCH', body: JSON.stringify({ paused, reason }) },
      token
    ),

  adminCreateTenantNotice: (
    token: string,
    tenantId: string,
    body: { title: string; message: string; severity?: 'info' | 'warning' | 'danger' }
  ) =>
    request<{ notice: SystemNotice }>(
      `/admin/tenants/${tenantId}/notices`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  listThreads: (token: string, mailboxId: string, filter?: string) => {
    const f = filter && filter !== 'all' ? `&filter=${encodeURIComponent(filter)}` : '';
    return request<{ threads: unknown[]; filter: string }>(
      `/email/threads?mailboxId=${encodeURIComponent(mailboxId)}${f}`,
      {},
      token
    );
  },

  getThreadMessages: (token: string, threadId: string, mailboxId?: string) => {
    const q = mailboxId ? `?mailboxId=${encodeURIComponent(mailboxId)}` : '';
    return request<{ thread: unknown; messages: unknown[] }>(
      `/email/threads/${encodeURIComponent(threadId)}/messages${q}`,
      {},
      token
    );
  },

  fetchMessageAttachment: (token: string, messageId: string, index: number) =>
    fetchBlob(
      `/email/messages/${encodeURIComponent(messageId)}/attachments/${index}`,
      token
    ),

  recordInboundEmail: (
    token: string,
    body: {
      mailboxId: string;
      fromAddress: string;
      fromName?: string;
      subject?: string;
      textBody?: string;
      htmlBody?: string;
      inReplyTo?: string;
      inboundMessageId?: string;
      externalMessageId?: string;
    }
  ) => request('/email/inbox', { method: 'POST', body: JSON.stringify(body) }, token),

  /* ---------------------------- Contacts --------------------------- */
  contactStats: (token: string) => request<ContactStats>('/contacts/stats', {}, token),

  listContacts: (
    token: string,
    params: { listId?: string; q?: string; page?: number } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.listId) qs.set('listId', params.listId);
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    const s = qs.toString();
    return request<{ contacts: Contact[]; total: number }>(`/contacts${s ? `?${s}` : ''}`, {}, token);
  },

  createContact: (
    token: string,
    body: { email: string; firstName?: string; lastName?: string; company?: string; listIds?: string[]; consent?: string }
  ) => request<{ contact: Contact }>('/contacts', { method: 'POST', body: JSON.stringify(body) }, token),

  updateContact: (
    token: string,
    id: string,
    body: Partial<Pick<Contact, 'firstName' | 'lastName' | 'company' | 'consent' | 'status' | 'tags'>>
  ) => request<{ contact: Contact }>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  deleteContact: (token: string, id: string) =>
    request<{ contact: Contact }>(`/contacts/${id}`, { method: 'DELETE' }, token),

  importContacts: (
    token: string,
    body: { rows: Record<string, string>[]; mapping: Record<string, string>; listId?: string; consent?: string }
  ) => request<{ results: ImportResult }>('/contacts/import', { method: 'POST', body: JSON.stringify(body) }, token),

  exportContactsUrl: (listId?: string) => {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    return listId ? `${base}/contacts/export?listId=${listId}` : `${base}/contacts/export`;
  },

  listContactLists: (token: string) =>
    request<{ lists: ContactList[] }>('/contacts/lists/all', {}, token),

  createContactList: (token: string, body: { name: string; description?: string }) =>
    request<{ list: ContactList }>('/contacts/lists', { method: 'POST', body: JSON.stringify(body) }, token),

  deleteContactList: (token: string, id: string) =>
    request<{ list: ContactList }>(`/contacts/lists/${id}`, { method: 'DELETE' }, token),

  /* ---------------------------- Templates -------------------------- */
  listTemplates: (token: string) => request<{ templates: Template[] }>('/templates', {}, token),

  getTemplate: (token: string, id: string) =>
    request<{ template: Template }>(`/templates/${id}`, {}, token),

  createTemplate: (token: string, body: { name: string; subject?: string; htmlBody?: string }) =>
    request<{ template: Template }>('/templates', { method: 'POST', body: JSON.stringify(body) }, token),

  updateTemplate: (token: string, id: string, body: Partial<Template>) =>
    request<{ template: Template }>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),

  duplicateTemplate: (token: string, id: string) =>
    request<{ template: Template }>(`/templates/${id}/duplicate`, { method: 'POST', body: '{}' }, token),

  testSendTemplate: (token: string, id: string) =>
    request<{ message: string }>(`/templates/${id}/test-send`, { method: 'POST', body: '{}' }, token),

  deleteTemplate: (token: string, id: string) =>
    request<{ template: Template }>(`/templates/${id}`, { method: 'DELETE' }, token),

  previewTemplate: (token: string, id: string) =>
    request<{ html: string; hasUnsubscribe: boolean }>(`/templates/${id}/preview`, {}, token),

  exportTemplate: (token: string, id: string, format: 'json' | 'html' = 'json') =>
    fetchBlob(`/templates/${id}/export?format=${format}`, token),

  importTemplate: (
    token: string,
    body: { name: string; subject?: string; htmlBody: string; kind?: string; blockId?: string }
  ) =>
    request<{ template: Template }>(
      '/templates/import',
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  listBlockTemplates: (token: string) =>
    request<{ blocks: BlockTemplate[] }>('/templates/blocks/list', {}, token),

  createTemplateFromBlock: (token: string, body: { blockId: string; name?: string }) =>
    request<{ template: Template }>(
      '/templates/blocks/create',
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  /* ----------------------------- Team ------------------------------ */
  listTeamUsers: (token: string) =>
    request<{ users: TeamUser[] }>('/team/users', {}, token),

  inviteTeamMember: (
    token: string,
    body: { email: string; name: string; role?: 'user' | 'admin' }
  ) =>
    request<{ user: TeamUser; tempPassword?: string; message: string }>(
      '/team/invite',
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  removeTeamUser: (token: string, id: string) =>
    request<{ removed: boolean }>(`/team/users/${id}`, { method: 'DELETE' }, token),

  /* ---------------------------- Campaigns -------------------------- */
  listCampaigns: (token: string) => request<{ campaigns: Campaign[] }>('/campaigns', {}, token),

  getCampaign: (token: string, id: string) =>
    request<{ campaign: Campaign }>(`/campaigns/${id}`, {}, token),

  createCampaign: (
    token: string,
    body: {
      name: string;
      subject: string;
      templateId: string;
      listId: string;
      scheduledAt?: string;
      attachments?: OutboundAttachment[];
    }
  ) => request<{ campaign: Campaign; preflight: CampaignPreflight }>(
    '/campaigns',
    { method: 'POST', body: JSON.stringify(body) },
    token
  ),

  preflightCampaign: (token: string, body: { templateId: string; listId: string }) =>
    request<CampaignPreflight>('/campaigns/preflight', { method: 'POST', body: JSON.stringify(body) }, token),

  scheduleCampaign: (token: string, id: string, body: { sendNow?: boolean; scheduledAt?: string } = {}) =>
    request<{ campaign: Campaign; message: string }>(
      `/campaigns/${id}/schedule`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  deleteCampaign: (token: string, id: string) =>
    request<{ campaign: Campaign }>(`/campaigns/${id}`, { method: 'DELETE' }, token),

  /* ----------------------------- Support --------------------------- */
  listSupportTickets: (token: string) =>
    request<{ tickets: SupportTicket[] }>('/support', {}, token),

  getSupportTicket: (token: string, id: string) =>
    request<{ ticket: SupportTicket }>(`/support/${id}`, {}, token),

  createSupportTicket: (
    token: string,
    body: { subject: string; message: string; attachments?: OutboundAttachment[] }
  ) =>
    request<{ ticket: SupportTicket }>('/support', { method: 'POST', body: JSON.stringify(body) }, token),

  replySupportTicket: (
    token: string,
    id: string,
    body: { message: string; attachments?: OutboundAttachment[] }
  ) =>
    request<{ ticket: SupportTicket }>(
      `/support/${id}/reply`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  /* ------------------------ Admin support -------------------------- */
  adminListSupportTickets: (token: string, params: { status?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', String(params.page));
    const s = qs.toString();
    return request<{ tickets: SupportTicket[]; total: number }>(
      `/admin/support${s ? `?${s}` : ''}`,
      {},
      token
    );
  },

  adminGetSupportTicket: (token: string, id: string) =>
    request<{ ticket: SupportTicket }>(`/admin/support/${id}`, {}, token),

  adminReplySupportTicket: (
    token: string,
    id: string,
    body: { message: string; attachments?: OutboundAttachment[] }
  ) =>
    request<{ ticket: SupportTicket }>(
      `/admin/support/${id}/reply`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  adminAssignTicket: (token: string, id: string, assigneeId: string | null) =>
    request<{ ticket: SupportTicket }>(
      `/admin/support/${id}/assign`,
      { method: 'PATCH', body: JSON.stringify({ assigneeId }) },
      token
    ),

  adminSetTicketStatus: (token: string, id: string, status: TicketStatus) =>
    request<{ ticket: SupportTicket }>(
      `/admin/support/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      token
    ),

  adminListSuppressions: (token: string, params: { q?: string; page?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.page) qs.set('page', String(params.page));
    const s = qs.toString();
    return request<{ suppressions: unknown[]; total: number }>(
      `/admin/suppressions${s ? `?${s}` : ''}`,
      {},
      token
    );
  },

  adminDeleteSuppression: (token: string, id: string) =>
    request<{ suppression: unknown }>(`/admin/suppressions/${id}`, { method: 'DELETE' }, token),

  adminListTransactions: (token: string, limit = 100) =>
    request<{ transactions: BillingTransaction[] }>(`/admin/transactions?limit=${limit}`, {}, token),

  adminRefundTransaction: (token: string, id: string, body: { skipProvider?: boolean; reason?: string } = {}) =>
    request<{ transaction: BillingTransaction }>(
      `/admin/transactions/${id}/refund`,
      { method: 'POST', body: JSON.stringify(body) },
      token
    ),

  adminListAuditLogs: (token: string, limit = 100) =>
    request<{ logs: AuditLogEntry[] }>(`/admin/audit?limit=${limit}`, {}, token),
};
