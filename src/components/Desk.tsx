"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EXAMPLE } from "@/lib/example";
import { readNdjson } from "@/lib/ndjson";
import { store } from "@/lib/store";
import { fileNo, fmtDate, type Card, type Dossier, type StreamEvent, type TriageResult } from "@/lib/types";
import { Board, type BoardHandle } from "./Board";

interface Msg { id: number; who: "me" | "them" | "err"; text: string; chips?: string[]; spent?: boolean }
const SUGGESTIONS = ["Deep-sea mining", "US", "History of espresso"];
const GREETING = "What should I open a file on? A technology, a person, a place, an event. If it’s broad, I’ll ask which angle you want first.";

const newFile = (query: string, brief: string): Dossier =>
  ({ id: "d" + Date.now().toString(36), query, brief, title: query, createdAt: Date.now(), clusters: [], tabs: [], cards: [] });

export function Desk() {
  const [dossier, setDossier] = useState<Dossier>(EXAMPLE);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, who: "them", text: GREETING, chips: SUGGESTIONS }]);
  const [busy, setBusy] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [libOpen, setLibOpen] = useState(false);
  const [files, setFiles] = useState<Dossier[]>([]);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [pad, setPad] = useState(0);
  const [asking, setAsking] = useState(false);

  const board = useRef<BoardHandle>(null), chat = useRef<HTMLElement>(null), thread = useRef<HTMLDivElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const pending = useRef<{ query: string; asked: { q: string; a: string }[] } | null>(null);
  const msgId = useRef(1);
  const current = useRef(dossier);
  useEffect(() => { current.current = dossier; });

  const say = useCallback((who: Msg["who"], text: string, chips?: string[]) => {
    setMsgs((m) => [...m, { id: msgId.current++, who, text, chips }]);
  }, []);

  // Reopen the last file on load.
  useEffect(() => {
    const last = store.lastId(), d = last ? store.get(last) : null;
    // localStorage only exists in the browser, so this has to happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d) setDossier(d);
  }, []);

  // Autosave, debounced. The example file and half-written files are never saved.
  useEffect(() => {
    if (dossier.example || busy || dossier.cards.length < 2) return;
    const t = setTimeout(() => store.save(dossier), 800);
    return () => clearTimeout(t);
  }, [dossier, busy]);

  useLayoutEffect(() => { thread.current?.scrollTo(0, thread.current.scrollHeight); }, [msgs]);

  // On narrow screens the chat panel covers the bottom of the board: tell the board so "fit" avoids it.
  useEffect(() => {
    const el = chat.current;
    if (!el) return;
    const update = () => setPad(window.innerWidth < 700 ? el.offsetHeight : 0);
    const ro = new ResizeObserver(update);
    ro.observe(el); window.addEventListener("resize", update); update();
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const onBoardChange = useCallback((next: Dossier) => setDossier(next), []);

  async function consume(res: Response, on: (ev: StreamEvent) => void): Promise<string | null> {
    if (!res.ok) { const j = await res.json().catch(() => null); return j?.error || "The server returned an error."; }
    let error: string | null = null;
    for await (const ev of readNdjson<StreamEvent>(res)) {
      if (ev.e === "error") error = ev.message; else on(ev);
    }
    return error;
  }

  async function begin(query: string, brief: string) {
    pending.current = null; setAsking(false);
    const prev = current.current;
    const fresh = newFile(query, brief);
    setDossier(fresh);
    say("them", `Opening a file: ${brief}`);
    if (window.innerWidth < 700) setChatOpen(false);
    setBusy("Researching…");
    ctl.current = new AbortController();
    let n = 0, searches = 0, error: string | null = null;
    const ensureRoot = (d: Dossier): Dossier => d.cards.some((c) => c.id === "root") ? d
      : { ...d, clusters: d.clusters.length ? d.clusters : ["Notes"], cards: [{ id: "root", t: "summary", c: 0, x: 0, y: 0, title: d.title, body: "" }, ...d.cards] };
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, brief }), signal: ctl.current.signal });
      error = await consume(res, (ev) => {
        if (ev.e === "status") setBusy(ev.text);
        else if (ev.e === "done") searches = ev.searches;
        else if (ev.e === "plan") setDossier((d) => d.clusters.length ? d : ensureRoot({ ...d, title: ev.title || d.title, clusters: ev.clusters, cards: [{ id: "root", t: "summary", c: 0, x: 0, y: 0, title: ev.title || d.title, angle: ev.angle, body: "" }] }));
        else if (ev.e === "summary") setDossier((d) => { const r = ensureRoot(d); return { ...r, cards: r.cards.map((c) => c.id === "root" ? { ...c, body: ev.body, takeaways: ev.takeaways } : c) }; });
        else if (ev.e === "card") {
          n++;
          setDossier((d0) => {
            const d = ensureRoot(d0), taken = new Set(d.cards.map((c) => c.id));
            const id = ev.card.id && !taken.has(ev.card.id) ? ev.card.id : `k${d.cards.length}${Math.random().toString(36).slice(2, 5)}`;
            const card: Card = { ...ev.card, id, c: Math.min(d.clusters.length - 1, ev.card.c), x: 0, y: 0 };
            setBusy(`Filing card ${d.cards.length} · ${d.clusters[card.c] ?? ""}`);
            return { ...d, cards: [...d.cards, card] };
          });
        }
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") error = "The connection dropped mid-research. Anything already filed is kept.";
    }
    setBusy(null); setChatOpen(true);
    if (n === 0) { setDossier(prev); if (error) say("err", error); else if (!ctl.current.signal.aborted) say("err", "Nothing usable came back. Try again, or rephrase the topic."); return; }
    store.remember(fresh.id);
    say("them", `Filed ${n} cards under ${fileNo(fresh)}${searches ? ` from ${searches} web search${searches === 1 ? "" : "es"}` : ""}. Drag cards to rearrange, pinch or scroll to zoom, and use Dig deeper on any card to branch out from it.`);
    if (error) say("err", error);
  }

  async function triage() {
    const p = pending.current;
    if (!p) return;
    if (p.asked.length >= 2) return begin(p.query, `${p.query}. Focus: ${p.asked.map((x) => x.a).join("; ")}`);
    setBusy("Reading the request…");
    ctl.current = new AbortController();
    try {
      const res = await fetch("/api/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p), signal: ctl.current.signal });
      const r = (await res.json()) as TriageResult & { error?: string };
      setBusy(null);
      if (!res.ok) { pending.current = null; say("err", r.error || "The server returned an error."); return; }
      if (!r.ready && r.question && r.options?.length) {
        p.asked.push({ q: r.question, a: "" }); setAsking(true);
        setChatOpen(true);
        say("them", r.question, [...r.options, "Broad overview"]);
      } else await begin(p.query, r.brief || p.query);
    } catch (e) {
      setBusy(null); pending.current = null;
      if ((e as Error).name !== "AbortError") say("err", "Couldn’t reach the server. Check that it is running, then try again.");
    }
  }

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    say("me", t);
    setMsgs((m) => m.map((x) => (x.chips ? { ...x, spent: true } : x)));
    const p = pending.current;
    if (p && p.asked.length) p.asked[p.asked.length - 1].a = t; else pending.current = { query: t, asked: [] };
    void triage();
  }

  async function dig(id: string) {
    const d = current.current, parent = d.cards.find((c) => c.id === id);
    if (!parent || busy || !board.current) return;
    if (d.example) say("them", "This is the example file, so branches here aren’t saved. Research your own topic to keep them.");
    const spot = board.current.freeSpot(id);
    setBusy(`Digging into “${parent.title ?? "card"}”…`);
    ctl.current = new AbortController();
    let n = 0, error: string | null = null;
    try {
      const res = await fetch("/api/dig", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.current.signal,
        body: JSON.stringify({ title: d.title, brief: d.brief, card: parent, others: d.cards.filter((c) => c.title && c.id !== id).map((c) => c.title) }),
      });
      error = await consume(res, (ev) => {
        if (ev.e === "status") setBusy(ev.text);
        else if (ev.e === "card") {
          const cid = `x${Date.now().toString(36)}${n++}`;
          setDossier((cur) => ({ ...cur, cards: [...cur.cards, { ...ev.card, id: cid, c: parent.c, rel: undefined, parent: id, ax: spot.x, ay: spot.y, x: spot.x, y: spot.y }] }));
        }
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") error = "The connection dropped. Anything already filed is kept.";
    }
    setBusy(null);
    if (error) say("err", error); else if (!n && !ctl.current.signal.aborted) say("them", "Nothing new came back for that card. Try another one.");
  }

  const open = (d: Dossier) => { if (busy) return; setDossier(d); if (!d.example) store.remember(d.id); setLibOpen(false); };
  const openLib = () => { setFiles(store.list()); setConfirmDel(null); setLibOpen(true); };
  const del = (d: Dossier) => {
    if (confirmDel !== d.id) return setConfirmDel(d.id);
    store.remove(d.id); setFiles(store.list()); setConfirmDel(null);
    if (current.current.id === d.id) setDossier(EXAMPLE);
  };

  return (
    <>
      <div className="bar">
        <div className="mark"><i />Dossier</div>
        <div className="fileline"><b>{fileNo(dossier)}</b> · {dossier.title}{dossier.example ? " · example" : ""}</div>
        <button className="btn" type="button" onClick={openLib}>Files</button>
      </div>
      <main>
        <Board ref={board} dossier={dossier} canDig={!busy} bottomPad={pad} onChange={onBoardChange} onDig={dig} />
        <section className={`chat${chatOpen ? "" : " closed"}`} ref={chat} aria-label="Research desk">
          <button className="chat-head" type="button" aria-expanded={chatOpen} onClick={() => setChatOpen((o) => !o)}>
            <span>Research desk</span><span>{chatOpen ? "Hide" : "Show"}</span>
          </button>
          <div className="thread" ref={thread} aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.who === "me" ? "me" : "them"}${m.who === "err" ? " err" : ""}`}>
                {m.text}
                {m.chips && (
                  <div className="chips">{m.chips.map((c) => <button key={c} type="button" disabled={m.spent || !!busy} onClick={() => submit(c)}>{c}</button>)}</div>
                )}
              </div>
            ))}
          </div>
          {busy && (
            <div className="status"><i className="pulse" /><span>{busy}</span><button type="button" onClick={() => ctl.current?.abort()}>Stop</button></div>
          )}
          <form className="ask" autoComplete="off" onSubmit={(e) => { e.preventDefault(); submit(input); setInput(""); }}>
            <input id="q" type="text" value={input} onChange={(e) => setInput(e.target.value)} maxLength={300} disabled={!!busy}
              placeholder={asking ? "…or type your own angle" : "Open a file on…"} aria-label="Topic to research" />
            <button className="btn primary" type="submit" disabled={!!busy || !input.trim()}>Research</button>
          </form>
        </section>
        {libOpen && (
          <aside className="lib" aria-label="Saved files">
            <header><h2>Files</h2><button className="btn" type="button" onClick={() => setLibOpen(false)}>Close</button></header>
            <div className="liblist">
              {!files.length && <div className="empty">No saved files yet. Every topic you research is filed here automatically.</div>}
              {[...files, EXAMPLE].map((d) => (
                <div className="file" key={d.id}>
                  <div className="t"><b>{d.title}</b><small>{fileNo(d)} · {d.example ? "example" : `${fmtDate(d.createdAt)} · ${d.cards.length - 1} cards`}</small></div>
                  <button type="button" onClick={() => open(d)}>Open</button>
                  {!d.example && <button type="button" className="del" onClick={() => del(d)}>{confirmDel === d.id ? "Really delete?" : "Delete"}</button>}
                </div>
              ))}
            </div>
          </aside>
        )}
      </main>
    </>
  );
}
