/**
 * Pure helpers for pulling a page's preview image out of its HTML. Kept free of server-only
 * imports so the unit tests can run them directly.
 */

const PRIVATE_HOST = /^(localhost|.*\.(local|localhost|internal|lan|home|corp|test))$/i;

/**
 * Only public http(s) hosts by name. IP literals are refused outright rather than range-checked:
 * real sites are addressed by name, and this keeps the server from being pointed at its own network.
 */
export function publicUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname;
  if (!h.includes(".") || PRIVATE_HOST.test(h) || /^[\d.]+$/.test(h) || h.startsWith("[")) return null;
  return u;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The attributes of every <meta> tag, lower-cased names, entity-decoded values. */
function metas(html: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g))
      attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
    out.push(attrs);
  }
  return out;
}

/** Many sites use their logo or a stock placeholder as the preview image; those say nothing about the topic. */
const GENERIC = /(^|[\/_.-])(logo|logos|favicon|icon|sprite|placeholder|default|blank|avatar)([\/_.-]|\d|$)/i;

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

const IMAGE_KEYS = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];

/**
 * The page's preview image (Open Graph, then Twitter card), resolved against `pageUrl`.
 * Only https images are returned, since the board is served over https and would block the rest.
 */
export function previewImage(html: string, pageUrl: string): { src: string; alt?: string; title?: string } | null {
  const tags = metas(html);
  const get = (k: string) => tags.find((t) => (t.property ?? t.name)?.toLowerCase() === k)?.content?.trim();
  for (const k of IMAGE_KEYS) {
    const v = get(k);
    if (!v) continue;
    const u = publicUrl(v, pageUrl);
    if (!u || u.protocol !== "https:" || /\.svg$/i.test(u.pathname) || GENERIC.test(safeDecode(u.pathname))) continue;
    const alt = get("og:image:alt") || get("twitter:image:alt");
    const title = get("og:title") || get("twitter:title") || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    return { src: u.href, alt: alt?.slice(0, 200), title: title ? decode(title).slice(0, 200) : undefined };
  }
  return null;
}
