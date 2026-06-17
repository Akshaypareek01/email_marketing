import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { billingWebhook } from './controllers/billing.controller.js';
import { snsSesWebhook } from './controllers/sns.controller.js';
import authRoutes from './routes/auth.routes.js';
import domainsRoutes from './routes/domains.routes.js';
import emailRoutes from './routes/email.routes.js';
import healthRoutes from './routes/health.routes.js';
import mailboxesRoutes from './routes/mailboxes.routes.js';
import plansRoutes from './routes/plans.routes.js';
import adminRoutes from './routes/admin.routes.js';
import accountRoutes from './routes/account.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import supportRoutes from './routes/support.routes.js';
import publicRoutes from './routes/public.routes.js';
import billingRoutes from './routes/billing.routes.js';
import teamRoutes from './routes/team.routes.js';

const app = express();

// Behind a load balancer / reverse proxy: trust exactly one proxy hop so
// req.ip is the real client (used by the rate limiter) and X-Forwarded-For
// cannot be spoofed by clients to bypass per-IP limits.
app.set('trust proxy', env.isProduction ? 1 : false);

/** Strict CORS allowlist — never reflect arbitrary origins with credentials:true. */
app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, server-to-server) that send no Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

/** Webhooks needing raw/text bodies — must register before express.json(). */
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhook);
app.post('/api/email/webhooks/sns', express.text({ type: '*/*' }), snsSesWebhook);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/mailboxes', mailboxesRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/team', teamRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use(errorHandler);

export default app;
