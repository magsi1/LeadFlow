import { createClient } from '@supabase/supabase-js'
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

export const testSupabaseConnection = async () => {
  try {
    const { error } = await supabase
      .from('leads')
      .select('id')
      .limit(1)

    if (error) {
      console.error("❌ Supabase error:", error.message)
    } else {
      console.log("✅ Supabase connected successfully")
    }
  } catch (err) {
    console.error("❌ Network error:", err)
  }
}
