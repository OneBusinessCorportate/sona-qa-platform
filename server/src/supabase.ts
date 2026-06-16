import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Service-role client: server-only. Bypasses RLS, so the sqa_* tables are
// reachable only through this API (no anon access).
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
