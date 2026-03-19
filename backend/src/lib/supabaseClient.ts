import { createClient } from '@supabase/supabase-js';

import { logger } from './logger.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.error('❌ Missing Supabase ENV variables', {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasSupabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
  throw new Error('Missing SUPABASE_URL and/or SUPABASE_ANON_KEY');
}

logger.info('✅ Supabase ENV loaded successfully');

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function testSupabaseConnection(): Promise<void> {
  const { error } = await supabase.from('leads').select('*').limit(1);
  if (error) {
    logger.error('❌ Supabase connection failed', {
      error: error.message,
    });
    return;
  }
  logger.info('✅ Supabase connected successfully');
}

