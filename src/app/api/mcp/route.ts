import { after } from "next/server";
import { createMcpHandler, getPublicOrigin, withMcpAuth } from "mcp-handler";
import { INSTRUCTIONS, registerTools, type Caller } from "@/lib/mcp";
import { RepoError, findToken, touchToken } from "@/lib/repo";
import { emailAllowed } from "@/lib/supabase/env";

// add_images fetches up to 10 outside pages; everything else returns in well under a second.
export const maxDuration = 60;

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "dossier", version: "1.0.0" },
  instructions: INSTRUCTIONS,
  // Never log requests: the bearer token travels in them.
  verboseLogs: false,
});

/**
 * Personal tokens from the website. Only the sha256 is stored; the allowlist is checked again on
 * every request, so removing an address from DOSSIER_ALLOWED_EMAILS cuts its agent off at once.
 */
async function verify(req: Request, bearer?: string) {
  let owner;
  try { owner = await findToken(bearer); } catch (e) {
    if (e instanceof RepoError) console.error("[mcp] token lookup failed:", e.message);
    return undefined;
  }
  if (!owner || !emailAllowed(owner.email)) return undefined;
  // last_used_at is for the website's token panel; don't make the agent wait for it.
  if (!owner.lastUsedAt || Date.now() - owner.lastUsedAt > 60_000) after(() => touchToken(owner.tokenId));
  const extra: Caller = { userId: owner.userId, email: owner.email, origin: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || getPublicOrigin(req) };
  return { token: "redacted", clientId: owner.userId, scopes: [], extra: { ...extra } };
}

const authed = withMcpAuth(handler, verify, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
