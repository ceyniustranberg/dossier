import { FAST_MODEL, WEB_SEARCH, friendly, getClient, noKey, searchPages } from "@/lib/llm";
import { ownerGuard, repoFail } from "@/lib/auth";
import { imagesFrom } from "@/lib/images";
import { imagesPrompt } from "@/lib/prompts";
import { addCards, loadDossier } from "@/lib/repo";
import { newId } from "@/lib/token";
import type { Card } from "@/lib/types";

export const maxDuration = 60;
const RESULTS = 10, MAX_IMAGES = 6;

/**
 * Find images for one card: a single web search, then each cited page's own preview image.
 * Every image therefore comes from a real page the search returned, and links back to it.
 * The image tile is saved to the dossier here, at the spot the owner chose on the board.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const dossierId = String(body?.dossier_id ?? ""), cardId = String(body?.card_id ?? "");
  const g = await ownerGuard(dossierId, "images");
  if (g instanceof Response) return g;
  const client = getClient();
  if (!client) return noKey();
  if (!WEB_SEARCH) return Response.json({ error: "Finding images needs web search, and DOSSIER_WEB_SEARCH is off." }, { status: 503 });
  const ax = Math.round(Number(body?.at?.x)), ay = Math.round(Number(body?.at?.y));
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return Response.json({ error: "Missing drop spot." }, { status: 400 });

  try {
    const d = (await loadDossier(dossierId))!.dossier, parent = d.cards.find((c) => c.id === cardId);
    if (!parent) return Response.json({ error: "No such card." }, { status: 404 });
    const subject = (parent.q || parent.title || "").trim().slice(0, 200);
    if (!subject) return Response.json({ error: "That card has nothing to search for." }, { status: 400 });

    let images;
    try {
      images = await imagesFrom(await searchPages(client, imagesPrompt({ subject, file: d.title }), RESULTS, req.signal), MAX_IMAGES, req.signal);
    } catch (err) {
      return Response.json({ error: friendly(err, FAST_MODEL) }, { status: 502 });
    }
    if (!images.length) return Response.json({ card: null });
    const id = "g" + newId(10);
    const card: Omit<Card, "x" | "y"> = { id, t: "gallery", c: parent.c, parent: parent.id, title: parent.title, q: subject, images };
    await addCards(dossierId, [{ id, content: card, ax, ay }]);
    return Response.json({ card: { ...card, ax, ay, x: ax, y: ay } });
  } catch (e) {
    return repoFail(e);
  }
}
