import { WEB_SEARCH, cardStream, getClient, ndjson, noKey } from "@/lib/llm";
import { guard } from "@/lib/auth";
import { digPrompt } from "@/lib/prompts";

export const maxDuration = 300;
const SEARCHES = 3;

export async function POST(req: Request) {
  const denied = await guard("dig");
  if (denied) return denied;

  const client = getClient();
  if (!client) return noKey();
  const body = await req.json().catch(() => null);
  if (!body?.card || typeof body.card !== "object") return Response.json({ error: "Missing card." }, { status: 400 });
  if (JSON.stringify(body.card).length > 8000) return Response.json({ error: "Card too large." }, { status: 400 });
  const { x: _x, y: _y, ax: _ax, ay: _ay, moved: _m, parent: _p, rel: _r, id: _i, c: _c, ...card } = body.card;
  void [_x, _y, _ax, _ay, _m, _p, _r, _i, _c];
  const others = (Array.isArray(body.others) ? body.others : []).slice(0, 80).map((t: unknown) => String(t).slice(0, 200));
  const prompt = digPrompt({ title: String(body.title ?? "").slice(0, 120), brief: String(body.brief ?? "").slice(0, 600), card, others, web: WEB_SEARCH, searches: SEARCHES });
  return ndjson(cardStream(client, prompt, SEARCHES, req.signal));
}
