import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Returns null when Supabase is not configured so callers can degrade instead of throwing.
 */
export async function createClient() {
  const { url, key, configured } = supabaseEnv();
  if (!configured) return null;
  const store = await cookies();

  return createServerClient(url!, key!, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. Proxy refreshes the session on every
          // request, so the write is redundant here rather than lost.
        }
      },
    },
  });
}
