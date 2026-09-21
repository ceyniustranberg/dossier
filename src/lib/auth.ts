import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { emailAllowed, supabaseEnv } from "./supabase/env";
import { LIMITS, check, type Bucket } from "./ratelimit";

export type AuthState =
  /** Supabase is not configured and this is a dev build: the prototype runs wide open. */
  | { mode: "off"; user: null }
  /** Supabase is not configured but this is a production build: deny everything. */
  | { mode: "misconfigured"; user: null }
  | { mode: "on"; user: User | null };

/**
 * The one place that decides whether a request is allowed. Memoised per render pass so a
 * page and its children share a single call to Supabase.
 *
 * Failing closed in production is deliberate: deploying without the Supabase env vars
 * should lock the app, not silently ship the unauthenticated prototype to the internet.
 */
export const verifySession = cache(async (): Promise<AuthState> => {
  if (!supabaseEnv().configured) {
    return process.env.NODE_ENV === "production"
      ? { mode: "misconfigured", user: null }
      : { mode: "off", user: null };
  }

  const supabase = await createClient();
  if (!supabase) return { mode: "misconfigured", user: null };

  // getUser() revalidates the JWT with Supabase. getSession() only reads the cookie and
  // must never be trusted on the server.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { mode: "on", user: null };
  if (!emailAllowed(data.user.email)) return { mode: "on", user: null };
  return { mode: "on", user: data.user };
});

/** True when the caller may use the app. */
export async function isAuthorised(): Promise<boolean> {
  const s = await verifySession();
  return s.mode === "off" || (s.mode === "on" && s.user !== null);
}

/**
 * Guard for route handlers. Returns a Response to send back, or null to continue.
 * Every API route calls this before spending a model token. Pass a bucket to
 * apply a per-user rate limit as well.
 */
export async function guard(bucket?: Bucket): Promise<Response | null> {
  const s = await verifySession();
  if (s.mode === "off") return null;
  if (s.mode === "misconfigured")
    return Response.json(
      { error: "Server is missing its Supabase configuration, so it is refusing requests." },
      { status: 503 },
    );
  if (!s.user) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (bucket) {
    const retry = check(`${bucket}:${s.user.id}`, LIMITS[bucket]);
    if (retry)
      return Response.json(
        { error: `Too many requests. Try again in ${retry}s.` },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
  }
  return null;
}
