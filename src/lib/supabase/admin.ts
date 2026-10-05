import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/**
 * Service-role client for the dossier tables. Those tables have row level security on and no
 * policies, so this is the only way in: it must never be imported by client code, and the key
 * must never be given a NEXT_PUBLIC_ name. Returns null when the key is not configured.
 */
export function admin(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}

export const noDb = () =>
  Response.json({ error: "SUPABASE_SECRET_KEY is not set. Add it to .env.local (Supabase dashboard -> API keys) and restart the server." }, { status: 503 });
