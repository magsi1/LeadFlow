import { createClient } from '@supabase/supabase-js'
import { resolve4 } from 'node:dns/promises'
import { env } from './env.js'

const supabaseUrl = env.SUPABASE_URL
const supabaseKey = env.SUPABASE_ANON_KEY

console.log('ENV DEBUG:', process.env.SUPABASE_URL)

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is missing')
}

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY is missing')
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export const runSupabaseStartupDiagnostics = async () => {
  console.log('🔎 Supabase startup diagnostics: begin')

  let host = ''
  try {
    const parsed = new URL(supabaseUrl)
    host = parsed.hostname
    console.log(`✅ SUPABASE_URL parse ok: ${parsed.origin}`)
  } catch (err) {
    console.error(`❌ Invalid SUPABASE_URL format: ${errorMessage(err)}`)
    return
  }

  try {
    const records = await resolve4(host)
    console.log(`✅ DNS resolve ok: ${host} -> ${records.join(', ')}`)
  } catch (err) {
    console.error(`❌ DNS resolve failed for ${host}: ${errorMessage(err)}`)
    return
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`❌ REST health check failed: HTTP ${res.status} ${res.statusText}`)
      console.error(`   Response: ${body.slice(0, 300)}`)
      return
    }

    console.log(`✅ REST health check ok: HTTP ${res.status}`)
  } catch (err) {
    console.error(`❌ Network/Fetch health check failed: ${errorMessage(err)}`)
    return
  }

  console.log('✅ Supabase startup diagnostics: complete')
}

export const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('leads').select('id').limit(1)

    if (error) {
      console.error("❌ Supabase error:", error.message)
    } else {
      console.log("✅ Supabase connected successfully")
    }
  } catch (err) {
    console.error("❌ Network/Fetch error:", err)
  }
}
