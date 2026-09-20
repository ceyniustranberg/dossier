"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailAllowed } from "@/lib/supabase/env";

export type LoginState = { ok: boolean; message: string } | null;

/**
 * Sends a magic link. No passwords to store, and no sign-up form to build.
 *
 * The allowlist is checked here so we never mail a stranger, and again in the data access
 * layer, which is what actually protects the API routes.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) return { ok: false, message: "Enter an email address." };

  const supabase = await createClient();
  if (!supabase)
    return { ok: false, message: "Supabase is not configured on this server." };

  if (!emailAllowed(email))
    return { ok: false, message: "That address is not on the allowlist for this dossier." };

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Check your email for a sign-in link." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
