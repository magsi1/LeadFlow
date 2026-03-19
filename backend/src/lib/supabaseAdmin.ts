import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Supabase env missing. Continuing without crashing startup.')
}

export const supabase = createClient(
  process.env.SUPABASE_URL ?? 'https://invalid.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'invalid-service-role-key',
)

export const testSupabaseConnection = async () => {
  try {
    const { error } = await supabase
      .from('leads')
      .select('id')
      .limit(1)

    if (error) {
      console.error("Supabase connection error:", error.message)
    } else {
      console.log("Supabase connected successfully")
    }
  } catch (err) {
    console.error("Supabase startup failed:", err)
  }
}
