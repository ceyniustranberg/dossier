import "server-only";

/**
 * Supabase renamed its client-side key from `anon` to `publishable` (sb_publishable_…).
 * Projects created before the rename still issue an anon key, so accept either name
 * and let whichever one is set win.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key, configured: Boolean(url && key) };
}

/**
 * `DOSSIER_AUTH=off` skips sign-in for local testing. Ignored in production builds, so a
 * stray copy of the variable in a deployment cannot open the app.
 */
export function authBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DOSSIER_AUTH === "off";
}

/** Emails allowed to sign in. Empty means "any authenticated user" in development only: the
 *  site is public now, so a production build with no allowlist lets nobody in. */
export function allowedEmails(): string[] {
  return (process.env.DOSSIER_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function emailAllowed(email: string | undefined | null): boolean {
  const list = allowedEmails();
  if (!list.length) return process.env.NODE_ENV !== "production";
  return Boolean(email && list.includes(email.toLowerCase()));
}
