import "server-only";
import { normUrl, sanitizeCard } from "./cards";
import type { StreamEvent } from "./types";

export const MODEL = process.env.DOSSIER_MODEL || "anthropic/claude-sonnet-5";
export const FAST_MODEL = process.env.DOSSIER_FAST_MODEL || "anthropic/claude-haiku-4.5";
export const WEB_SEARCH = (process.env.DOSSIER_WEB_SEARCH || "on").toLowerCase() !== "off";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type Client = { key: string };

export function getClient(): Client | null {
  const key = process.env.OPENROUTER_API_KEY;
  return key ? { key } : null;
}

export const noKey = () =>
  Response.json({ error: "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the server." }, { status: 503 });

/** A failed OpenRouter call: an HTTP error before the stream starts, or an error chunk mid-stream. */
export class LlmError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function friendly(err: unknown, model = MODEL): string {
  if (err instanceof LlmError) {
    if (err.status === 401) return "The OpenRouter API key was rejected. Check OPENROUTER_API_KEY.";
    if (err.status === 402) return "The OpenRouter account is out of credits. Top it up and try again.";
    if (err.status === 429) return "Rate limited by the model provider. Wait a moment and try again.";
    if (err.status === 404 || (err.status === 400 && /model/i.test(err.message)))
      return `The model "${model}" was rejected: ${err.message}. Set DOSSIER_MODEL to an OpenRouter model id.`;
    if (err.status >= 500) return "The model provider is having trouble right now. Try again shortly.";
    return err.message;
  }
  return "The research run was interrupted. Anything already filed is kept.";
}

type Message = { role: "system" | "user" | "assistant"; content: string };
type Annotation = { type?: string; url_citation?: { url?: string; title?: string } };
type Chunk = {
  error?: { code?: number; message?: string };
  choices?: { delta?: { content?: string | null; annotations?: Annotation[] }; message?: { annotations?: Annotation[] }; finish_reason?: string | null }[];
  usage?: { server_tool_use?: { web_search_requests?: number } };
};

async function call(client: Client, body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${client.key}`, "Content-Type": "application/json", "X-Title": "Dossier" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new LlmError(res.status, j?.error?.message || res.statusText);
  }
  return res;
}

/** One-shot completion; returns the reply text. */
export async function complete(client: Client, o: { model: string; max_tokens: number; messages: Message[] }, signal: AbortSignal): Promise<string> {
  const res = await call(client, o, signal);
  const j = await res.json() as { choices?: { message?: { content?: string | null } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

/** Parse an OpenRouter SSE body into its JSON chunks. Comment lines (keep-alives) are skipped. */
async function* sse(res: Response): AsyncGenerator<Chunk> {
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      const data = l.slice(5).trim();
      if (data === "[DONE]") return;
      try { yield JSON.parse(data) as Chunk; } catch { /* partial or malformed */ }
    }
  }
}

/**
 * Run one research prompt and stream the result to the browser as NDJSON events.
 * The model writes JSON Lines; each complete line is validated and forwarded as soon as it arrives,
 * so cards land on the board while the rest is still being written. Web search runs as OpenRouter's
 * `openrouter:web_search` server tool, and the URLs it cites form the allow-list for links on cards.
 * Citations can arrive after the text that uses them, so a card linking to a URL not yet cited is
 * held back and re-checked once the stream ends, rather than filed with its links stripped.
 */
export function cardStream(client: Client, prompt: string, searches: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => { try { controller.enqueue(enc.encode(JSON.stringify(ev) + "\n")); } catch { /* closed */ } };
      // Long web-search turns produce no text for a minute at a time. Proxies (and Vercel over
      // HTTP/1.1) close idle connections, so emit a blank line periodically: `readNdjson` skips it.
      const beat = setInterval(() => { try { controller.enqueue(enc.encode("\n")); } catch { /* closed */ } }, 15_000);
      const web = WEB_SEARCH && searches > 0;
      const allowed = new Map<string, string>();
      const held: Record<string, unknown>[] = [];
      let line = "", searchCount = 0, truncated = false, writing = false;

      const cite = (list: Annotation[] | undefined) => {
        for (const a of list ?? []) {
          const u = a.type === "url_citation" ? a.url_citation?.url : undefined;
          if (u) allowed.set(normUrl(u), a.url_citation?.title || "Source");
        }
      };
      const fileCard = (o: Record<string, unknown>) => {
        const card = sanitizeCard(o, allowed);
        if (card) send({ e: "card", card });
      };
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
          const urls = [o.url, ...(Array.isArray(o.sources) ? o.sources : [])].filter((u): u is string => typeof u === "string");
          if (web && urls.some((u) => !allowed.has(normUrl(u)))) held.push(o);
          else fileCard(o);
        }
      };
      const feed = (text: string) => {
        const parts = (line + text).split("\n");
        line = parts.pop() ?? "";
        parts.forEach(eat);
      };

      try {
        send({ e: "status", text: web ? "Searching the web…" : "Researching…" });
        const res = await call(client, {
          model: MODEL, max_tokens: 16000, stream: true,
          messages: [{ role: "user", content: prompt }],
          ...(web ? { tools: [{ type: "openrouter:web_search", parameters: { max_uses: searches, max_results: 5 } }] } : {}),
        }, signal);

        for await (const ch of sse(res)) {
          if (ch.error) throw new LlmError(ch.error.code ?? 500, ch.error.message ?? "Stream error");
          const choice = ch.choices?.[0];
          cite(choice?.delta?.annotations);
          cite(choice?.message?.annotations);
          const text = choice?.delta?.content;
          if (text) {
            if (!writing) { writing = true; send({ e: "status", text: "Writing the dossier…" }); }
            feed(text);
          }
          if (choice?.finish_reason === "length") truncated = true;
          const n = ch.usage?.server_tool_use?.web_search_requests;
          if (typeof n === "number") searchCount = n;
        }
        eat(line);
        held.splice(0).forEach(fileCard);
        if (truncated) send({ e: "error", message: "The dossier was cut off at the length limit. What was filed before that is kept." });
        send({ e: "done", searches: searchCount });
      } catch (err) {
        eat(line);
        held.splice(0).forEach(fileCard);
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
