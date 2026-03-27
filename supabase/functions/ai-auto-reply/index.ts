import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const config = {
  verify_jwt: false,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type LeadPayload = {
  id?: string
  name?: string
  message?: string
  source?: string
  phone?: string
  auto_replied?: boolean
}

function buildReply(name?: string): string {
  const safeName = (name ?? '').trim()
  if (safeName.length > 0) {
    return `Hi ${safeName}, thanks for your message! We'll contact you shortly.`
  }
  return "Hi, thanks for your message! We'll contact you shortly."
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'method_not_allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    const body = (await req.json()) as LeadPayload
    console.log('AUTO REPLY TRIGGERED', body)

    const leadId = (body.id ?? '').trim()
    if (leadId.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'lead_id_required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (supabaseUrl.length === 0 || serviceRoleKey.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'supabase_env_missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, message, source, phone, auto_replied')
      .eq('id', leadId)
      .single()

    if (leadError != null || lead == null) {
      return new Response(
        JSON.stringify({ ok: false, error: `lead_lookup_failed:${leadError?.message ?? 'not_found'}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (lead.auto_replied === true) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'already_auto_replied' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const replyMessage = buildReply(lead.name)

    // Mock WhatsApp send (replace with provider call when ready)
    const whatsappApiUrl = (Deno.env.get('WHATSAPP_API_URL') ?? '').trim()
    if (whatsappApiUrl.length > 0) {
      await fetch(whatsappApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: lead.phone,
          message: replyMessage,
          lead_id: lead.id,
          source: lead.source,
        }),
      })
    } else {
      console.log('MOCK WHATSAPP SEND', {
        phone: lead.phone,
        message: replyMessage,
        lead_id: lead.id,
      })
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({ auto_replied: true })
      .eq('id', lead.id)
      .eq('auto_replied', false)

    if (updateError != null) {
      return new Response(
        JSON.stringify({ ok: false, error: `mark_auto_replied_failed:${updateError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, auto_replied: true, reply: replyMessage }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
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
})
