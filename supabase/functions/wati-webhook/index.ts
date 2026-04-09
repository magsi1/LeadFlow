export const config = { verify_jwt: false }

// @ts-ignore Deno runtime resolves URL imports at deploy/runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: {
  env: { get: (key: string) => string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

type JsonMap = Record<string, unknown>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROJECT_URL = Deno.env.get('PROJECT_URL')!
const ANON_KEY = Deno.env.get('ANON_KEY')!

function jsonResponse(status: number, payload: JsonMap) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  if (!PROJECT_URL || !ANON_KEY) {
    return jsonResponse(500, {
      success: false,
      error: 'Missing env vars: PROJECT_URL and/or ANON_KEY',
    })
  }

  const supabase = createClient(PROJECT_URL, ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  try {
    const raw = await req.json()
    const body = (raw ?? {}) as Record<string, unknown>
    const incomingName =
      readString(body.name) ||
      readString(body.contactName) ||
      readString(body.senderName)
    const incomingPhone =
      readString(body.phone) ||
      readString(body.waId) ||
      readString(body.from)
    const incomingMessage =
      readString(body.message) ||
      readString(body.text) ||
      readString((body.messageText as unknown))

    if (!incomingPhone || !incomingMessage) {
      return jsonResponse(400, { success: false, error: 'Missing required fields: phone and message' })
    }

    const leadPayload = {
      name: incomingName || 'Unknown',
      phone: incomingPhone,
      source: 'WHATSAPP',
      intent: 'HOT',
      message: incomingMessage,
    }

    // Prefer requested schema fields (source/intent), with fallback to common schema (source_channel/priority).
    const primaryInsert = await supabase.from('leads').insert([leadPayload])
    if (primaryInsert.error) {
      const fallbackInsert = await supabase.from('leads').insert([
        {
          name: incomingName || 'Unknown',
          phone: incomingPhone,
          source_channel: 'whatsapp',
          priority: 'high',
          message: incomingMessage,
        },
      ])
      if (fallbackInsert.error) {
        throw new Error(fallbackInsert.error.message)
      }
    }

    return jsonResponse(200, { success: true })
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: errorMessage(error),
    })
  }
})
