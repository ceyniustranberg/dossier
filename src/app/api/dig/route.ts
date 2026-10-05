import { WEB_SEARCH, cardStream, getClient, ndjson, noKey } from "@/lib/llm";
import { ownerGuard, repoFail } from "@/lib/auth";
import { digPrompt } from "@/lib/prompts";
import { LIMITS, addCards, cardCount, loadDossier } from "@/lib/repo";
import { newId } from "@/lib/token";
import type { Card, StreamEvent } from "@/lib/types";

export const maxDuration = 300;
const SEARCHES = 3;

/**
 * Dig deeper from the board. The server researches the card through OpenRouter, saves each new
 * card as it arrives (so every open copy of the board sees it on its next poll) and streams the
 * same events to the caller for live status. The browser never posts card content.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const dossierId = String(body?.dossier_id ?? ""), cardId = String(body?.card_id ?? "");
  const g = await ownerGuard(dossierId, "dig");
  if (g instanceof Response) return g;
  const client = getClient();
  if (!client) return noKey();
  const at = body?.at, ax = Math.round(Number(at?.x)), ay = Math.round(Number(at?.y));
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return Response.json({ error: "Missing drop spot." }, { status: 400 });

  let loaded;
  try {
    loaded = await loadDossier(dossierId);
    if ((await cardCount(dossierId)) >= LIMITS.cardsPerDossier) return Response.json({ error: "This dossier is full." }, { status: 409 });
  } catch (e) { return repoFail(e); }
  const d = loaded!.dossier, parent = d.cards.find((c) => c.id === cardId);
  if (!parent || parent.t === "summary") return Response.json({ error: "No such card." }, { status: 404 });

  const { x: _x, y: _y, ax: _ax, ay: _ay, moved: _m, parent: _p, rel: _r, id: _i, c: _c, images: _im, ...card } = parent;
  void [_x, _y, _ax, _ay, _m, _p, _r, _i, _c, _im];
  const others = d.cards.filter((c) => c.title && c.id !== cardId).slice(0, 80).map((c) => c.title!.slice(0, 200));
  const prompt = digPrompt({ title: d.title, brief: d.brief, card, others, web: WEB_SEARCH, searches: SEARCHES });
  return ndjson(cardStream(client, prompt, SEARCHES, req.signal).pipeThrough(saving(dossierId, parent, ax, ay)));
}

/** Pass the NDJSON stream through, saving each card event to the dossier before forwarding it. */
function saving(dossierId: string, parent: Card, ax: number, ay: number): TransformStream<Uint8Array, Uint8Array> {
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const handle = async (line: string, out: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.trim()) { out.enqueue(enc.encode("\n")); return; } // heartbeat
    let ev: StreamEvent;
    try { ev = JSON.parse(line); } catch { return; }
    if (ev.e === "card") {
      const id = "x" + newId(10);
      const content = { ...ev.card, id, c: parent.c, rel: undefined, parent: parent.id };
      try { await addCards(dossierId, [{ id, content, ax, ay }]); } catch (e) {
        out.enqueue(enc.encode(JSON.stringify({ e: "error", message: e instanceof Error ? e.message : "Could not save a card." }) + "\n"));
        return;
      }
      ev = { e: "card", card: JSON.parse(JSON.stringify(content)) };
    }
    out.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
  };
  return new TransformStream({
    async transform(chunk, out) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) await handle(l, out);
    },
    async flush(out) { if (buf) await handle(buf, out); },
  });
}
