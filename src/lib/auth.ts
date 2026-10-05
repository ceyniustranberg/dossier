import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { authBypassed, emailAllowed, supabaseEnv } from "./supabase/env";
import { LIMITS, check, type Bucket } from "./ratelimit";
import { RepoError, meta, type DossierMeta } from "./repo";

export type AuthState =
  /** Dev build with Supabase unconfigured or `DOSSIER_AUTH=off`: the prototype runs wide open. */
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
  if (authBypassed()) return { mode: "off", user: null };
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

/**
 * Who is looking at a page. `bypass` is the dev-only `DOSSIER_AUTH=off` (or Supabase unconfigured
 * in dev), where the local viewer is treated as the owner of every dossier.
 */
export async function viewer(): Promise<{ user: User | null; bypass: boolean }> {
  const s = await verifySession();
  return { user: s.mode === "on" ? s.user : null, bypass: s.mode === "off" };
}

export const owns = (v: { user: User | null; bypass: boolean }, owner: string) => v.bypass || v.user?.id === owner;

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

/**
 * Guard for routes that change a dossier: signed in, within the rate limit, and the owner.
 * Anyone else gets a 404, so the response does not confirm that an unlisted id exists.
 */
export async function ownerGuard(id: string, bucket?: Bucket): Promise<{ meta: DossierMeta } | Response> {
  const denied = await guard(bucket);
  if (denied) return denied;
  const [v, m] = await Promise.all([viewer(), meta(id)]);
  if (!m || !owns(v, m.owner)) return Response.json({ error: "No such dossier." }, { status: 404 });
  return { meta: m };
}

/** A RepoError as a JSON response; anything else is logged and reported generically. */
export function repoFail(e: unknown): Response {
  if (e instanceof RepoError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
}
