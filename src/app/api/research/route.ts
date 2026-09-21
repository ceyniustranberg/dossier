import { WEB_SEARCH, cardStream, getClient, ndjson, noKey } from "@/lib/llm";
import { guard } from "@/lib/auth";
import { researchPrompt } from "@/lib/prompts";

export const maxDuration = 300;
const SEARCHES = 8;

export async function POST(req: Request) {
  const denied = await guard("research");
  if (denied) return denied;

  const client = getClient();
  if (!client) return noKey();
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";
  const brief = typeof body?.brief === "string" ? body.brief.trim().slice(0, 600) : query;
  if (!query) return Response.json({ error: "Missing query." }, { status: 400 });
  return ndjson(cardStream(client, researchPrompt(query, brief, WEB_SEARCH, SEARCHES), SEARCHES, req.signal));
}
