import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { emailAllowed } from "@/lib/supabase/env";

/**
 * Lands the magic link. Supabase sends either a PKCE `code` or a `token_hash` + `type`
 * depending on how the project's email template is configured, so handle both.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  const supabase = await createClient();
  if (!supabase) return fail("Supabase is not configured.");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(error.message);
  } else {
    return fail("That sign-in link is missing its token.");
  }

  // The link proves control of an inbox, not that the inbox is welcome here.
  const { data } = await supabase.auth.getUser();
  if (!emailAllowed(data.user?.email)) {
    await supabase.auth.signOut();
    return fail("That address is not on the allowlist for this dossier.");
  }

  return NextResponse.redirect(origin);
}
