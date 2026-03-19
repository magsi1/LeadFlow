import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
}

export const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
)

export const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase
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
