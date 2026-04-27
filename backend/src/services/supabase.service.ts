import { createClient, SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  logger.warn(
    'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — auth and persistence will fail.'
  );
}

// Admin client — bypasses RLS, used for server-side persistence after we have
// already verified the user via JWT.
export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Verify a user JWT and return the authenticated user, or null.
export async function verifyJwt(token: string): Promise<{ id: string; email?: string } | null> {
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}
