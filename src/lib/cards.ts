import type { Card, CardType, Source } from "./types";

const TYPES: CardType[] = ["fact", "stat", "timeline", "player", "article", "lead", "debate", "question", "chart", "picture"];
const str = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : undefined);
const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : undefined;

export const normUrl = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/$/, "");

/**
 * Turn one model-written JSON object into a safe card. `allowed` maps the URLs that web search
 * really returned to their titles: any other URL is dropped, so the board never shows a made-up link.
 */
export function sanitizeCard(o: Record<string, unknown>, allowed: Map<string, string>): Omit<Card, "x" | "y"> | null {
  let t = o.t as CardType;
  if (!TYPES.includes(t)) return null;
  const okUrl = (u: unknown) => (typeof u === "string" && allowed.has(normUrl(u)) ? u.trim() : undefined);
  let url = okUrl(o.url);
  if (t === "article" && !url) { t = "lead"; url = undefined; }
  const sources: Source[] = (Array.isArray(o.sources) ? o.sources : [])
    .map(okUrl).filter((u): u is string => !!u && u !== url).slice(0, 2)
    .map((u) => ({ url: u, title: allowed.get(normUrl(u)) || "Source" }));
  const card: Omit<Card, "x" | "y"> = {
    id: str(o.id, 24) ?? "", t, c: Math.max(0, Math.trunc(Number(o.c)) || 0),
    rel: str(o.rel, 24), title: str(o.title, 200), body: str(o.body, 1200), num: str(o.num, 40), role: str(o.role, 120),
    pro: strs(o.pro, 6, 200), con: strs(o.con, 6, 200), unit: str(o.unit, 20), note: str(o.note, 300),
    q: str(o.q, 200) ?? (t === "lead" ? str(o.title, 200) : undefined), url, outlet: str(o.outlet, 80), date: str(o.date, 40),
    items: Array.isArray(o.items)
      ? o.items.slice(0, 8).map((i) => ({ when: str((i as Record<string, unknown>)?.when, 40) ?? "", what: str((i as Record<string, unknown>)?.what, 300) ?? "" }))
      : undefined,
    bars: Array.isArray(o.bars)
      ? o.bars.slice(0, 6).map((b) => ({ label: str((b as Record<string, unknown>)?.label, 60) ?? "", value: Number((b as Record<string, unknown>)?.value) }))
          .filter((b) => Number.isFinite(b.value))
      : undefined,
    sources: sources.length ? sources : undefined,
  };
  return JSON.parse(JSON.stringify(card));
}
