/**
 * Triggers n8n workflow: Hot → immediate WA; Warm → Wait 10m → WA; Cold → Wait 24h → WA.
 * Configure URL in n8n (Webhook node) and set N8N_LEAD_TEMPERATURE_WEBHOOK_URL to match.
 */

const DEFAULT_WEBHOOK =
  'https://magsideveloper.app.n8n.cloud/webhook/lead-temperature-followup'

export type LeadTemperaturePayload = {
  phone: string
  name: string
  lead_id: string
  user_id: string
  /** Display casing for n8n Switch: Hot | Warm | Cold */
  status: 'Hot' | 'Warm' | 'Cold'
  message?: string
  reason?: string
}

export function isN8nLeadTemperatureEnabled(): boolean {
  const v = (process.env.N8N_TEMPERATURE_AUTOMATION_ENABLED ?? 'true').toLowerCase()
  return v !== 'false' && v !== '0'
}

export function getN8nLeadTemperatureWebhookUrl(): string {
  const u = process.env.N8N_LEAD_TEMPERATURE_WEBHOOK_URL?.trim()
  return u != null && u.length > 0 ? u : DEFAULT_WEBHOOK
}

/**
 * Fire-and-forget POST so webhook handling stays fast.
 */
export function notifyN8nLeadTemperatureAutomation(payload: LeadTemperaturePayload): void {
  if (!isN8nLeadTemperatureEnabled()) {
    return
  }
  const url = getN8nLeadTemperatureWebhookUrl()
  const body = JSON.stringify(payload)
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
    .then(async (res) => {
      const text = await res.text()
      if (!res.ok) {
        console.error('[n8n-temperature] webhook failed', res.status, text.slice(0, 400))
      } else {
        console.log('[n8n-temperature] webhook ok', res.status, payload.status, payload.lead_id)
      }
    })
    .catch((e) => {
      console.error('[n8n-temperature] webhook error', e)
    })
}
