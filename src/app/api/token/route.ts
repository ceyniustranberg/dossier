import { repoFail, verifySession } from "@/lib/auth";
import { issueToken, revokeTokens } from "@/lib/repo";
import { emailAllowed } from "@/lib/supabase/env";
import { LIMITS, check } from "@/lib/ratelimit";

/**
 * A personal MCP token needs a real signed-in, allowlisted account: the local DOSSIER_AUTH=off
 * bypass has no user for the token to belong to.
 */
async function signedIn() {
  const s = await verifySession();
  if (s.mode !== "on" || !s.user?.email || !emailAllowed(s.user.email))
    return Response.json({ error: s.mode === "off" ? "Sign-in is switched off locally (DOSSIER_AUTH=off), and a token needs a real account. Turn sign-in back on to issue one." : "Sign in first." }, { status: 401 });
  return s.user;
}

/** Issue a new token, revoking the previous one. The response is the only time the token is visible. */
export async function POST() {
  const user = await signedIn();
  if (user instanceof Response) return user;
  const retry = check(`token:${user.id}`, LIMITS.token);
  if (retry) return Response.json({ error: `Too many requests. Try again in ${retry}s.` }, { status: 429 });
  try {
    return Response.json({ token: await issueToken(user.id, user.email!) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return repoFail(e);
  }
}

export async function DELETE() {
  const user = await signedIn();
  if (user instanceof Response) return user;
  try {
    await revokeTokens(user.id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return repoFail(e);
  }
}
