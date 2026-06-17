# SES SNS — Production Setup

Configure AWS SES event publishing so bounces, complaints, deliveries, opens, and clicks flow into Mail Box at `POST /api/email/webhooks/sns`.

## Prerequisites

- Production API reachable over **HTTPS** (ALB, Cloudflare, ngrok for staging).
- `SES_CONFIG_SETS_ENABLED=true` when using per-tenant configuration sets.
- `SES_VERIFY_SNS_SIGNATURE=true` in production.
- `API_PUBLIC_URL=https://api.yourdomain.com/api` (used in docs/links; webhook path is below).

## 1. Create SNS topic

```bash
aws sns create-topic --name mailbox-ses-events --region us-east-1
```

Set in `.env`:

```env
SES_SNS_TOPIC_ARN=arn:aws:sns:us-east-1:ACCOUNT_ID:mailbox-ses-events
SES_VERIFY_SNS_SIGNATURE=true
```

## 2. Subscribe HTTPS endpoint

**Endpoint URL:**

```text
https://api.yourdomain.com/api/email/webhooks/sns
```

Via AWS Console:

1. SNS → Topics → `mailbox-ses-events` → **Create subscription**
2. Protocol: **HTTPS**
3. Endpoint: URL above
4. Enable raw message delivery: **off** (default — SES wraps events in SNS `Notification`)

Via CLI:

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:mailbox-ses-events \
  --protocol https \
  --notification-endpoint https://api.yourdomain.com/api/email/webhooks/sns \
  --region us-east-1
```

Mail Box auto-confirms subscriptions when it receives `SubscriptionConfirmation` (fetches `SubscribeURL`).

## 3. SES configuration set event destination

For each tenant configuration set (or a platform default set):

1. SES → Configuration sets → your set → **Event destinations** → Add destination
2. Event types: **Send, Delivery, Bounce, Complaint, Open, Click** (as needed)
3. Destination: SNS topic `mailbox-ses-events`

CLI example:

```bash
aws sesv2 create-configuration-set-event-destination \
  --configuration-set-name tenant-slug \
  --event-destination-name sns-events \
  --event-destination '{
    "Enabled": true,
    "MatchingEventTypes": ["SEND","DELIVERY","BOUNCE","COMPLAINT","OPEN","CLICK"],
    "SnsDestination": { "TopicArn": "arn:aws:sns:us-east-1:ACCOUNT_ID:mailbox-ses-events" }
  }' \
  --region us-east-1
```

## 4. Verify end-to-end

1. Send a test campaign or single email through a domain using the configuration set.
2. Check API logs for `sns` / `ses-event` entries.
3. Confirm suppression list updates on hard bounce/complaint.
4. Confirm campaign stats increment on delivery/open/click.

## 5. Security checklist

| Item | Recommendation |
|------|----------------|
| HTTPS only | SNS rejects non-HTTPS subscriptions in most regions |
| Signature verify | `SES_VERIFY_SNS_SIGNATURE=true` |
| Idempotency | Webhook handler dedupes by SES message id |
| Account suppression sync | `SES_SYNC_SUPPRESSIONS=true` for AWS account-level list import |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Subscription pending | Ensure API is public HTTPS; check logs for confirmation fetch errors |
| 403 Invalid SNS signature | Clock skew, wrong region cert, or proxy altering body — use `express.text` raw body (already configured) |
| No events | Configuration set not attached to send; check `configurationSetName` on outbound |
| Opens/clicks missing | Enable OPEN/CLICK on event destination; some clients block tracking pixels |

## Local development

SNS cannot reach `localhost`. Options:

- **ngrok:** `ngrok http 4000` → subscribe `https://xxxx.ngrok.io/api/email/webhooks/sns`
- **Manual inject:** POST sample SNS `Notification` JSON to the webhook (disable signature verify locally only)

```env
# Local only — never in production
# SES_VERIFY_SNS_SIGNATURE=false
```
