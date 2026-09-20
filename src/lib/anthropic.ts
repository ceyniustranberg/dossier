import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { normUrl, sanitizeCard } from "./cards";
import type { StreamEvent } from "./types";

export const MODEL = process.env.DOSSIER_MODEL || "claude-sonnet-5";
export const FAST_MODEL = process.env.DOSSIER_FAST_MODEL || "claude-haiku-4-5";
export const WEB_SEARCH = (process.env.DOSSIER_WEB_SEARCH || "on").toLowerCase() !== "off";

export function getClient(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

export const noKey = () =>
  Response.json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server." }, { status: 503 });

function friendly(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
    if (err.status === 429) return "Rate limited by the Claude API. Wait a moment and try again.";
    if (err.status === 404) return `The model "${MODEL}" was not found. Set DOSSIER_MODEL to a model your key can use.`;
    if (err.status && err.status >= 500) return "The Claude API is having trouble right now. Try again shortly.";
    return err.message;
  }
  return "The research run was interrupted. Anything already filed is kept.";
}

/**
 * Run one research prompt and stream the result to the browser as NDJSON events.
 * Claude writes JSON Lines; each complete line is validated and forwarded as soon as it arrives,
 * so cards land on the board while the rest is still being written. Web searches surface as
 * status events, and the URLs they return form the allow-list for links on cards.
 */
export function cardStream(client: Anthropic, prompt: string, searches: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => { try { controller.enqueue(enc.encode(JSON.stringify(ev) + "\n")); } catch { /* closed */ } };
      // Long web-search turns produce no text for a minute at a time. Proxies (and Vercel over
      // HTTP/1.1) close idle connections, so emit a blank line periodically: `readNdjson` skips it.
      const beat = setInterval(() => { try { controller.enqueue(enc.encode("\n")); } catch { /* closed */ } }, 15_000);
      const allowed = new Map<string, string>();
      let line = "", searchCount = 0, searchFailed: string | null = null, truncated = false;

      const eat = (raw: string) => {
        let l = raw.trim();
        if (l[0] !== "{") return;
        if (l.endsWith(",")) l = l.slice(0, -1);
        let o: Record<string, unknown>;
        try { o = JSON.parse(l); } catch { return; }
        if (o.t === "plan") {
          const clusters = Array.isArray(o.clusters) ? o.clusters.map((c) => String(c).slice(0, 40)).slice(0, 6) : [];
          if (clusters.length) send({ e: "plan", title: String(o.title ?? "").slice(0, 80), angle: String(o.angle ?? "").slice(0, 200), clusters });
        } else if (o.t === "summary") {
          send({ e: "summary", body: String(o.body ?? "").slice(0, 3000), takeaways: Array.isArray(o.takeaways) ? o.takeaways.map(String).slice(0, 6) : [] });
        } else {
          const card = sanitizeCard(o, allowed);
          if (card) send({ e: "card", card });
        }
      };
      const feed = (text: string) => {
        const parts = (line + text).split("\n");
        line = parts.pop() ?? "";
        parts.forEach(eat);
      };

      try {
        const tools: Anthropic.Messages.ToolUnion[] = WEB_SEARCH && searches > 0
          ? [{ type: "web_search_20260209", name: "web_search", max_uses: searches }] : [];
        const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
        send({ e: "status", text: tools.length ? "Planning the searches…" : "Researching…" });

        // A long server-tool turn can come back as `pause_turn`; send it back to let Claude continue.
        for (let turn = 0; turn < 4; turn++) {
          const stream = client.messages.stream({ model: MODEL, max_tokens: 64000, messages, ...(tools.length ? { tools } : {}) }, { signal });
          let toolJson = "", inSearch = false;
          for await (const ev of stream) {
            if (ev.type === "content_block_start") {
              const b = ev.content_block;
              if (b.type === "server_tool_use") { inSearch = true; toolJson = ""; }
              else if (b.type === "web_search_tool_result") {
                if (Array.isArray(b.content)) {
                  for (const r of b.content) if (r.type === "web_search_result") allowed.set(normUrl(r.url), r.title);
                } else {
                  // Server-tool errors arrive as a 200 with an error object here, never as a throw.
                  const code = (b.content as { error_code?: string } | null)?.error_code;
                  searchFailed = code ?? "unknown";
                  send({ e: "status", text: `Web search unavailable (${searchFailed}); writing from knowledge.` });
                }
              }
            } else if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta") feed(ev.delta.text);
              else if (ev.delta.type === "input_json_delta" && inSearch) toolJson += ev.delta.partial_json;
            } else if (ev.type === "content_block_stop" && inSearch) {
              inSearch = false; searchCount++;
              try { const q = JSON.parse(toolJson).query; if (q) send({ e: "status", text: `Searching the web: ${String(q).slice(0, 80)}` }); } catch { /* ignore */ }
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "max_tokens") truncated = true;
          if (final.stop_reason !== "pause_turn") break;
          messages.push({ role: "assistant", content: final.content as unknown as Anthropic.ContentBlockParam[] });
        }
        eat(line);
        if (truncated) send({ e: "error", message: "The dossier was cut off at the length limit. What was filed before that is kept." });
        send({ e: "done", searches: searchCount });
      } catch (err) {
        eat(line);
        if (!signal.aborted) send({ e: "error", message: friendly(err) });
      } finally {
        clearInterval(beat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
}

export const ndjson = (body: ReadableStream<Uint8Array>) =>
  new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });

export { friendly };
