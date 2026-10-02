import "server-only";
import { previewImage, publicUrl } from "./og";
import type { FoundImage } from "./types";

const PAGE_TIMEOUT = 6_000, MAX_BYTES = 400_000, MAX_REDIRECTS = 3;

/**
 * Fetch the start of a page's HTML. Redirects are followed by hand so every hop is re-checked
 * with `publicUrl`; the body is cut off after MAX_BYTES, since preview tags live in <head>.
 */
async function head(url: string, signal: AbortSignal): Promise<{ html: string; url: string } | null> {
  let at = publicUrl(url);
  for (let hop = 0; at && hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(at, {
      redirect: "manual", signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT)]),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DossierBot/0.1)", Accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      await res.body?.cancel();
      at = next ? publicUrl(next, at.href) : null;
      continue;
    }
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "") || !res.body) { await res.body?.cancel(); return null; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let html = "";
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    await reader.cancel().catch(() => {});
    return { html, url: at.href };
  }
  return null;
}

/** Preview images for a list of cited pages, fetched in parallel, de-duplicated, best-first. */
export async function imagesFrom(pages: { url: string; title: string }[], max: number, signal: AbortSignal): Promise<FoundImage[]> {
  const found = await Promise.allSettled(pages.map(async (p): Promise<FoundImage | null> => {
    const h = await head(p.url, signal);
    const img = h && previewImage(h.html, h.url);
    return img ? { src: img.src, page: p.url, title: p.title || img.title || new URL(p.url).hostname, alt: img.alt } : null;
  }));
  const seen = new Set<string>(), out: FoundImage[] = [];
  for (const r of found) {
    if (r.status !== "fulfilled" || !r.value || seen.has(r.value.src)) continue;
    seen.add(r.value.src);
    out.push(r.value);
    if (out.length >= max) break;
  }
  return out;
}
