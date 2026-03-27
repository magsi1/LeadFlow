# WhatsApp follow-up drip (n8n + Supabase)

## 1. Supabase

Run `backend/sql/011_whatsapp_followup_runs.sql` in the Supabase SQL editor.

Inbound replies are detected from **`public.messages`** where **`is_from_customer = true`** (same rows your WhatsApp webhook already inserts).

## 2. n8n environment variables

In n8n (Settings → Variables or your host env), set:

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta permanent/system user token |
| `SUPABASE_PROJECT_REF` | Project ref only (e.g. `abcdxyz` from `abcdxyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service role** key (bypasses RLS; required for automation) |

Do **not** use the anon key for this workflow.

## 3. Import workflow

1. n8n → **Workflows** → **Import from File**.
2. Select `whatsapp-followup-drip.json`.
3. Re-open each **HTTP Request** node if expressions fail to resolve (n8n version differences).
4. Activate the workflow and copy the **Webhook URL** for `whatsapp-followup-drip`.

**Wait** nodes require **n8n** to be reachable on a **public URL** (cloud n8n OK; self-hosted needs `WEBHOOK_URL` set).

## 4. Trigger payload (POST)

```json
{
  "phone": "923001234567",
  "lead_id": "<uuid from public.leads>",
  "user_id": "<uuid auth user / lead owner>",
  "first_message": "Hi, thanks for your interest..."
}
```

- **`phone`**: digits only, international, no `+` (same format as Meta `to` field).
- **`first_message`**: first outbound; the workflow logs it to **`messages`** and starts timers from **`sequence_started_at`**.

## 5. Flow summary

1. Send first WhatsApp (Meta Graph API).
2. Insert **`whatsapp_followup_runs`** + log outbound in **`messages`**.
3. **Wait 2 hours** → query **`messages`** for inbound after **`sequence_started_at`**.
4. **If reply** → PATCH run → **`stopped_customer_replied`**.
5. **If no reply** → send *"Just checking in, did you get my last message?"* → log → **Wait 24 hours** → check inbound after second send.
6. **If reply** → stop; **else** → final message → **`completed_no_reply`**.

## 6. Optional: chain after bulk send

From your existing bulk-message workflow, add an **HTTP Request** node that **POST**s the same JSON to this webhook for each lead so the drip starts right after the first blast.

## 7. Troubleshooting

- **GET** filters: if `created_at=gt.<iso>` fails, wrap the timestamp with `encodeURIComponent()` in the URL expression.
- **PATCH** targets a single row by **`followup_run_id`** returned from the insert (see **Merge followup_run_id** node).
- If import drops **Wait** webhooks, re-add **Wait** nodes and reconnect.

## 8. Lead temperature — WhatsApp timing (Hot / Warm / Cold)

Import **`lead-temperature-followup.json`**, activate it, and confirm the webhook path is **`/webhook/lead-temperature-followup`** (n8n Cloud shows the full URL).

### Behaviour

| `status` (from backend) | n8n branch | Timing | Action |
|-------------------------|------------|--------|--------|
| **Hot** | Output “Hot” | None | Send follow-up WhatsApp **immediately** |
| **Warm** | Output “Warm” | **Wait** 10 minutes | Send follow-up WhatsApp |
| **Cold** | Output “Cold” | **Wait** 24 hours | Send follow-up WhatsApp |

Uses **Switch** branching and **Wait** nodes (`resume: timeInterval`), same pattern as the drip workflow.

### Backend trigger

After AI classification, LeadFlow **POST**s JSON to the webhook (fire-and-forget):

- Default URL: `https://magsideveloper.app.n8n.cloud/webhook/lead-temperature-followup`
- Override with env: `N8N_LEAD_TEMPERATURE_WEBHOOK_URL`
- Disable: `N8N_TEMPERATURE_AUTOMATION_ENABLED=false`

Payload fields: `phone` (digits), `name`, `lead_id`, `user_id`, `status` (`Hot` | `Warm` | `Cold`), optional `message`, `reason`.

### Hot + AI auto-reply

If your WhatsApp pipeline already sends an **immediate AI reply**, you may get **two** quick messages for Hot leads. Disable the **Send WhatsApp (Hot — immediate)** node in n8n and keep Warm/Cold only, or turn off auto-reply for that path.

### Requirements

Same env as §2: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`. **Wait** nodes need a **public** n8n URL (n8n Cloud is fine).
