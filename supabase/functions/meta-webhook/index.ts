import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const config = {
  verify_jwt: false,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type MetaLeadField = {
  name?: string
  values?: Array<string | number | null> | null
}

type MetaLeadResponse = {
  field_data?: MetaLeadField[]
}

function firstFieldValue(fields: MetaLeadField[], ...names: string[]): string {
  for (const name of names) {
    const match = fields.find((f) => (f.name ?? '').toLowerCase() === name.toLowerCase())
    const value = match?.values?.[0]
    if (value !== undefined && value !== null) {
      return String(value).trim()
    }
  }
  return ''
}

async function fetchMetaLead(
  leadId: string,
  accessToken: string,
): Promise<{ name: string; phone: string; email: string }> {
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(leadId)}`)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('fields', 'field_data')

  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`meta_graph_fetch_failed:${res.status}:${text}`)
  }

  const data = (await res.json()) as MetaLeadResponse
  const fields = data.field_data ?? []

  const fullName = firstFieldValue(fields, 'full_name')
  const firstName = firstFieldValue(fields, 'first_name')
  const lastName = firstFieldValue(fields, 'last_name')
  const name = fullName || `${firstName} ${lastName}`.trim() || 'Meta Lead'
  const phone = firstFieldValue(fields, 'phone_number', 'phone')
  const email = firstFieldValue(fields, 'email', 'email_address')

  return { name, phone, email }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  const url = new URL(req.url)

  // VERIFY WEBHOOK
  if (req.method === 'GET') {
    const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? 'leadflow_token'
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge') ?? ''

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, { status: 200, headers: corsHeaders })
    }

    return new Response('Forbidden', { status: 403, headers: corsHeaders })
  }

  // HANDLE LEAD EVENT
  if (req.method === 'POST') {
    try {
      const metaAccessToken = Deno.env.get('META_LEAD_ACCESS_TOKEN') ?? ''
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

      if (!metaAccessToken || !supabaseUrl || !serviceRoleKey) {
        return new Response(
          JSON.stringify({ ok: false, error: 'required_env_missing' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const body = (await req.json()) as {
        object?: string
        entry?: Array<{
          changes?: Array<{
            field?: string
            value?: {
              leadgen_id?: string
              platform?: string
            }
          }>
        }>
      }

      let inserted = 0

      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'leadgen') continue

          const leadId = (change.value?.leadgen_id ?? '').trim()
          if (!leadId) continue

          const source =
            (change.value?.platform ?? body.object ?? 'facebook').toLowerCase() === 'instagram'
              ? 'instagram'
              : 'facebook'

          const leadData = await fetchMetaLead(leadId, metaAccessToken)
          const { error } = await supabase.from('leads').insert({
            name: leadData.name,
            phone: leadData.phone,
            email: leadData.email,
            status: 'cold',
            source,
            created_at: new Date().toISOString(),
          })

          if (error) {
            console.error('supabase_insert_failed', error.message)
            continue
          }

          inserted += 1
        }
      }

      return new Response(JSON.stringify({ ok: true, inserted }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders })
})
