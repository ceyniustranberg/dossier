import { FAST_MODEL, WEB_SEARCH, friendly, getClient, noKey, searchPages } from "@/lib/llm";
import { guard } from "@/lib/auth";
import { imagesFrom } from "@/lib/images";
import { imagesPrompt } from "@/lib/prompts";

export const maxDuration = 60;
const RESULTS = 10, MAX_IMAGES = 6;

/**
 * Find images for one card: a single web search, then each cited page's own preview image.
 * Every image therefore comes from a real page the search returned, and links back to it.
 */
export async function POST(req: Request) {
  const denied = await guard("images");
  if (denied) return denied;

  const client = getClient();
  if (!client) return noKey();
  if (!WEB_SEARCH) return Response.json({ error: "Finding images needs web search, and DOSSIER_WEB_SEARCH is off." }, { status: 503 });
  const body = await req.json().catch(() => null);
  const subject = String(body?.q || body?.title || "").trim().slice(0, 200);
  if (!subject) return Response.json({ error: "Missing subject." }, { status: 400 });
  const file = String(body?.file ?? "").slice(0, 120);

  try {
    const pages = await searchPages(client, imagesPrompt({ subject, file }), RESULTS, req.signal);
    const images = await imagesFrom(pages, MAX_IMAGES, req.signal);
    return Response.json({ images });
  } catch (err) {
    return Response.json({ error: friendly(err, FAST_MODEL) }, { status: 502 });
  }
}
