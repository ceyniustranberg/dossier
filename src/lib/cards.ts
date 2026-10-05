import { publicUrl } from "./og.ts";
import type { Card, CardType, Source } from "./types";

const TYPES: CardType[] = ["fact", "stat", "timeline", "player", "article", "lead", "debate", "question", "chart", "picture"];
const str = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, max) : undefined);
const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : undefined;

const normUrl = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/$/, "");

/** A sanitized card, before the board gives it a position. */
export type CardContent = Omit<Card, "x" | "y">;

/** `sources` may be plain URLs or `{ url, title }` objects; agents tend to send the latter. */
const sourceList = (v: unknown): { url: unknown; title?: string }[] =>
  (Array.isArray(v) ? v : []).map((s) => (s && typeof s === "object" ? { url: (s as Record<string, unknown>).url, title: str((s as Record<string, unknown>).title, 200) } : { url: s }));

/** A link survives if it is an ordinary public http(s) URL; anything else (javascript:, localhost, private IPs) is dropped. */
const okUrl = (u: unknown) => (typeof u === "string" ? publicUrl(u.trim())?.href : undefined);
const sourceTitle = (u: string, given?: string) => given || (publicUrl(u)?.hostname.replace(/^www\./, "") ?? "Source");

/**
 * Turn one card written by the user's own agent over MCP into a safe card. The server never saw
 * that agent's searches, so there is no allow-list to check links against: a link survives if it
 * is an ordinary public http(s) URL, and the card is marked `via: "agent"` so the board can say
 * whose citation it is.
 */
export function sanitizeAgentCard(o: Record<string, unknown>): CardContent | null {
  let t = o.t as CardType;
  if (!TYPES.includes(t)) return null;
  let url = okUrl(o.url);
  if (t === "article" && !url) { t = "lead"; url = undefined; }
  const sources: Source[] = sourceList(o.sources)
    .map((s) => ({ url: okUrl(s.url), given: s.title }))
    .filter((s): s is { url: string; given: string | undefined } => !!s.url && normUrl(s.url) !== normUrl(url ?? "")).slice(0, 2)
    .map((s) => ({ url: s.url, title: sourceTitle(s.url, s.given) }));
  const card: CardContent = {
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
    via: "agent",
  };
  return JSON.parse(JSON.stringify(card));
}

/** An href that is safe to render: http(s) only. A last line of defence behind the write-time checks. */
export function safeHref(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:" ? p.href : undefined; } catch { return undefined; }
}
