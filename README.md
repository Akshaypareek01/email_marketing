# Mail Box — Multi-Tenant Email Platform

Control plane for a multi-tenant email SaaS (AWS SES outbound + Stalwart inbox), based on the architecture spec.

## Structure

| Folder     | Stack                          |
|-----------|---------------------------------|
| `backend/`  | Node.js, Express, MongoDB       |
| `frontend/` | Next.js, TypeScript, Tailwind   |

## Quick start

### 1. MongoDB

Run MongoDB locally (Docker example):

```bash
docker run -d --name mailbox-mongo -p 27017:27017 mongo:7
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

API: `http://localhost:4000/api`

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm run dev
```

App: `http://localhost:3000`

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register tenant + admin |
| POST | `/api/auth/login` | Login |
| GET | `/api/domains` | List domains |
| POST | `/api/domains` | Add domain + DNS records |
| POST | `/api/domains/:id/verify` | Check SES verification |
| GET | `/api/mailboxes` | List mailboxes |
| POST | `/api/mailboxes` | Create mailbox (Stalwart stub) |
| POST | `/api/email/send` | Send via SES; optional `threadId` to reply in-thread |
| GET | `/api/email/threads?mailboxId=&filter=` | List conversations (`filter`: `all`, `inbox`, `sent`) |
| GET | `/api/email/threads/:threadId/messages` | All messages in a thread (chat order) |
| POST | `/api/email/inbox` | Record inbound; use `inReplyTo` to attach to existing thread |
| GET | `/api/email/events` | List email events |
| POST | `/api/email/webhooks/ses` | SES SNS webhook |
| POST | `/api/email/webhooks/inbound` | Inbound webhook; include `inReplyTo` for threading |

## Mail UI (Gmail-style threads)

Dashboard → **Mail**:

- **Primary** — all conversations  
- **Inbox** — threads where the last message was **inbound** (client replied)  
- **Sent** — threads where the last message was **outbound** (you sent last)

Open a thread to see a **chat-style** timeline (your messages on the right, theirs on the left). **Reply** continues the same thread.

**Threading rule:** each outbound message gets an RFC `Message-ID`. When the client replies, their mail must include `In-Reply-To` (or your webhook must pass it). The API looks up that id and appends to the same thread—same as Gmail.

**Try it locally:**

1. **Mail** → **New message** → send to a client address.  
2. Copy **Message-ID** from your blue bubble.  
3. **Simulate client reply** → paste into **In-Reply-To** → submit.  
4. The reply appears in the **same conversation**.

Production: Stalwart (or a worker) should POST to `/api/email/webhooks/inbound` with `to`, `from`, `subject`, `text`/`html`, `messageId`, and **`inReplyTo`** from the email headers.

## Notes

- **SES** and **Stalwart** integrations are stubbed in `backend/src/services/` — replace with real AWS SDK and Stalwart API calls for production.
- Domain verification marks domains **active** via the SES status stub so you can test mailboxes locally.
- Add real DNS monitoring workers (BullMQ/Redis) as a next step per the architecture doc.
# email_marketing
