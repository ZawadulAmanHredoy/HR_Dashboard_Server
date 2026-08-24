import { createClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "../config/env.js";

/**
 * Null until SUPABASE_URL + a key are present in .env. Every service checks this
 * and falls back to the in-memory seed store so the UI runs without a project.
 */
export const supabase = hasSupabase
  ? createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    const error = new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env",
    );
    error.status = 503;
    throw error;
  }
  return supabase;
}
