import { FAST_MODEL, friendly, getClient, noKey } from "@/lib/anthropic";
import { guard } from "@/lib/auth";
import { triagePrompt } from "@/lib/prompts";
import type { TriageResult } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await guard("triage");
  if (denied) return denied;

  const client = getClient();
  if (!client) return noKey();
  const body = await req.json().catch(() => null);
  const query = typeof body?.query === "string" ? body.query.trim().slice(0, 300) : "";
  if (!query) return Response.json({ error: "Missing query." }, { status: 400 });
  const asked = (Array.isArray(body?.asked) ? body.asked : []).slice(0, 3)
    .map((x: { q?: unknown; a?: unknown }) => ({ q: String(x?.q ?? "").slice(0, 300), a: String(x?.a ?? "").slice(0, 300) }));

  try {
    const msg = await client.messages.create(
      { model: FAST_MODEL, max_tokens: 400, messages: [{ role: "user", content: triagePrompt(query, asked) }] },
      { signal: req.signal },
    );
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    let r: TriageResult = { ready: true, brief: query };
    try {
      const o = JSON.parse(text.slice(a, b + 1));
      if (o.ready === false && typeof o.question === "string" && Array.isArray(o.options) && o.options.length)
        r = { ready: false, question: o.question.slice(0, 300), options: o.options.map(String).slice(0, 6) };
      else if (typeof o.brief === "string" && o.brief) r = { ready: true, brief: o.brief.slice(0, 400) };
    } catch { /* fall through: treat as ready */ }
    return Response.json(r);
  } catch (err) {
    return Response.json({ error: friendly(err) }, { status: 502 });
  }
}
