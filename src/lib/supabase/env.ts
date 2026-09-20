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

/** Emails allowed to sign in. Empty means "any authenticated user", which is only safe
 *  if sign-ups are disabled in the Supabase dashboard. */
export function allowedEmails(): string[] {
  return (process.env.DOSSIER_ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function emailAllowed(email: string | undefined | null): boolean {
  const list = allowedEmails();
  if (!list.length) return true;
  return Boolean(email && list.includes(email.toLowerCase()));
}
