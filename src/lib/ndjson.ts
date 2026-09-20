/** Read a fetch Response body as newline-delimited JSON. */
export async function* readNdjson<T>(res: Response): AsyncGenerator<T> {
  if (!res.body) return;
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) { try { yield JSON.parse(l) as T; } catch { /* skip */ } }
  }
  if (buf.trim()) { try { yield JSON.parse(buf) as T; } catch { /* skip */ } }
}
