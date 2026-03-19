# LeadFlow Webhook Backend

Node.js + TypeScript webhook service for ingesting real inbound events from:
- WhatsApp Cloud API
- Instagram Messaging (Meta webhooks)
- Facebook Messenger (Meta webhooks)

The service normalizes channel payloads, writes to Supabase, and relies on existing Supabase realtime subscriptions in Flutter to reflect updates instantly.

## Endpoints

- `GET /health`
- `GET /webhooks/meta` (Meta verification challenge)
- `POST /webhooks/meta` (Meta inbound webhook ingestion)
- `POST /api/messages/send` (outbound send from CRM)
- `POST /api/messages/:id/retry` (retry failed outbound)
- `GET /api/integrations/accounts`
- `POST /api/integrations/accounts`
- `GET /api/workspaces`
- `GET /api/workspaces/:workspaceId/members`
- `PATCH /api/workspaces/:workspaceId/members/:profileId/role`
- `PATCH /api/workspaces/:workspaceId/members/:profileId/status`
- `POST /api/workspaces/:workspaceId/invitations`
- `GET /api/workspaces/:workspaceId/assignment-rules`

## Required Environment Variables

Copy `.env.example` to `.env` and set:

- `BACKEND_PORT`
- `API_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (backend only, never in Flutter)
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET` (used for `x-hub-signature-256` validation)
- `META_APP_ID`
- `WHATSAPP_PHONE_NUMBER_ID` (optional helper value)
- `WHATSAPP_BUSINESS_ACCOUNT_ID` (optional helper value)
- `WHATSAPP_ACCESS_TOKEN` (or store token in `integration_accounts.config`)
- `FACEBOOK_PAGE_ACCESS_TOKEN` (or store token in `integration_accounts.config`)
- `INSTAGRAM_ACCESS_TOKEN` (or store token in `integration_accounts.config`)
- `AUTO_CREATE_LEAD_FROM_INBOUND=true|false` (optional, defaults false)
- `BACKEND_ENFORCE_WORKSPACE_AUTH=true|false` (default false for local/dev compatibility)

## Local Run

Prereq: Node.js 20+ installed.

```bash
cd backend
npm install
npm run dev
```

## Webhook Verification

Use this callback URL in Meta app settings:

`https://<your-public-domain>/webhooks/meta`

Meta performs:
- `GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`

If `hub.verify_token` matches `META_WEBHOOK_VERIFY_TOKEN`, the backend echoes `hub.challenge`.

## Tunnel For Local Testing

Example with ngrok:

```bash
ngrok http 8080
```

Use resulting public URL + `/webhooks/meta` as Meta callback.

## Sample Test Payloads

Use included payloads:
- `examples/whatsapp-inbound.json`
- `examples/instagram-inbound.json`
- `examples/facebook-inbound.json`

Quick local test without signature enforcement (leave `META_APP_SECRET` empty):

```bash
curl -X POST "http://localhost:8080/webhooks/meta" \
  -H "Content-Type: application/json" \
  --data-binary @examples/whatsapp-inbound.json
```

## Integration Account Mapping

Inbound events are mapped through `integration_accounts`:
- `channel`
- `external_account_id`
- `external_phone_number_id` (WhatsApp-specific helper)
- `status` (`connected` or `pending`)

If mapping is missing, event is logged and skipped safely.

Workspace admin APIs:
- when auth enforcement is enabled, bearer auth + workspace membership are required.
- integration management is owner/admin only.
- message send/retry requires active workspace member role.

## Idempotency and Retry Safety

Duplicate prevention is handled by:
- message-level lookup on `messages.external_message_id`
- unique index `uq_messages_external_message_id`
- optional client id uniqueness on `messages.client_message_id`

Meta webhook retries are safe and do not create duplicate messages.

Outbound retry behavior:
- failed sends can be retried using `POST /api/messages/:id/retry`
- retries create a fresh outbound message attempt to preserve audit trail

## What Gets Written to Supabase

For inbound message events:
1. Resolve integration account
2. Find/create conversation
3. Insert message row (with `external_message_id`, `raw_payload`, `metadata`)
4. Update conversation preview + timestamp
5. Increment `unread_count`
6. Insert activity (`inbound_message_received`)
7. Optionally auto-create lead (if enabled)

For outbound message events:
1. Insert pending outbound message row (`status='pending'`)
2. Send via channel adapter
3. On accept: update to `sent` + persist `external_message_id`
4. On error: update to `failed` + `error_code`/`error_message`
5. Status callbacks (`delivered`/`read`/`failed`) reconcile by `external_message_id`
6. Activity rows are created for queued/sent/delivered/read/failed lifecycle

## Notes

- Parser coverage is defensive and intentionally conservative.
- Unsupported event shapes are logged and skipped (non-fatal).
- Outbound channel service methods are scaffolded for future API send flows.
- Instagram/Facebook outbound delivery depends on Meta app permissions, subscribed webhook fields,
  and approved messaging scopes. If capability is missing, backend returns explicit failure states
  instead of faking successful delivery.
