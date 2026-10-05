"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { readNdjson } from "@/lib/ndjson";
import { fileNo, type Action, type Card, type Dossier, type StreamEvent } from "@/lib/types";
import { Board, type BoardHandle, type Ghost } from "./Board";

interface Props {
  initial: Dossier;
  rev: number;
  updatedAt: number;
  /** The signed-in viewer owns this dossier: drags are saved and the card actions work. */
  isOwner: boolean;
  /** The built-in example: read-only, never polled. */
  example?: boolean;
}

type Pos = { x: number; y: number };

/** Poll fast while the agent is likely still writing, slowly once the board has gone quiet. */
const pollDelay = (updatedAt: number) => (Date.now() - updatedAt < 10 * 60_000 ? 2_000 : 15_000);

/**
 * Bring a dossier fetched from the server into the board. The server is the source of truth for
 * content; positions are not: the layout recomputes every card nobody has dragged, so keeping the
 * local spot avoids a needless relayout, and a card this tab is dragging or still saving keeps
 * its local position until the save lands.
 */
function merge(local: Dossier, server: Dossier, dirty: Map<string, Pos>): Dossier {
  const mine = new Map(local.cards.map((c) => [c.id, c]));
  const cards = server.cards.map((s): Card => {
    const l = mine.get(s.id), d = dirty.get(s.id);
    if (d) return { ...s, x: d.x, y: d.y, moved: true };
    if (l && !s.moved) return { ...s, x: l.x, y: l.y };
    return s;
  });
  return { ...server, tabs: local.tabs, cards };
}

export function DossierView({ initial, rev: rev0, updatedAt: upd0, isOwner, example }: Props) {
  const [dossier, setDossier] = useState<Dossier>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; err?: boolean } | null>(null);
  const [placing, setPlacing] = useState<Ghost | null>(null);
  const [live, setLive] = useState(!example && pollDelay(upd0) === 2_000);
  const [copied, setCopied] = useState(false);

  const board = useRef<BoardHandle>(null), ctl = useRef<AbortController | null>(null);
  const current = useRef(dossier), rev = useRef(rev0), updatedAt = useRef(upd0);
  const dirty = useRef(new Map<string, Pos>()), saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { current.current = dossier; });

  const say = useCallback((text: string, err?: boolean) => setNote({ text, err }), []);

  // ---- live updates ---------------------------------------------------------------------
  useEffect(() => {
    if (example) return;
    let timer: ReturnType<typeof setTimeout>, stopped = false;
    const tick = async () => {
      if (!document.hidden) {
        try {
          const res = await fetch(`/api/dossiers/${initial.id}?rev=${rev.current}`, { cache: "no-store" });
          if (res.status === 200) {
            const j = (await res.json()) as { dossier: Dossier; rev: number; updatedAt: number };
            rev.current = j.rev; updatedAt.current = j.updatedAt;
            setDossier((d) => merge(d, j.dossier, dirty.current));
          } else if (res.status === 404) { say("This dossier was deleted.", true); stopped = true; }
        } catch { /* offline for a moment: try again next tick */ }
        setLive(pollDelay(updatedAt.current) === 2_000);
      }
      if (!stopped) timer = setTimeout(tick, pollDelay(updatedAt.current));
    };
    timer = setTimeout(tick, pollDelay(updatedAt.current));
    return () => { stopped = true; clearTimeout(timer); };
  }, [example, initial.id, say]);

  // ---- saving drags -------------------------------------------------------------------
  const flush = useCallback(async () => {
    const batch = [...dirty.current];
    await Promise.all(batch.map(async ([cid, p]) => {
      try {
        const res = await fetch(`/api/dossiers/${initial.id}/cards/${cid}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "save failed");
      } catch (e) { say(`Couldn’t save that move: ${(e as Error).message}`, true); }
      // Only forget it if it hasn't been dragged again while the save was in flight.
      const now = dirty.current.get(cid);
      if (now && now.x === p.x && now.y === p.y) dirty.current.delete(cid);
    }));
  }, [initial.id, say]);

  const onBoardChange = useCallback((next: Dossier, byUser: boolean) => {
    if (byUser && isOwner && !example) {
      const prev = new Map(current.current.cards.map((c) => [c.id, c]));
      for (const c of next.cards) {
        const p = prev.get(c.id);
        if (c.moved && (!p || p.x !== c.x || p.y !== c.y)) dirty.current.set(c.id, { x: c.x, y: c.y });
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 400);
    }
    setDossier(next);
  }, [isOwner, example, flush]);

  // ---- card actions (owner) -----------------------------------------------------------
  async function dig(id: string, at: Pos) {
    const parent = current.current.cards.find((c) => c.id === id);
    if (!parent) return;
    setPlacing({ ...at, label: "Digging deeper…", from: id });
    setBusy(`Digging into “${parent.title ?? "card"}”…`);
    ctl.current = new AbortController();
    let n = 0, error: string | null = null;
    try {
      const res = await fetch("/api/dig", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.current.signal,
        body: JSON.stringify({ dossier_id: initial.id, card_id: id, at }),
      });
      if (!res.ok) error = (await res.json().catch(() => null))?.error || "The server returned an error.";
      else for await (const ev of readNdjson<StreamEvent>(res)) {
        if (ev.e === "status") setBusy(ev.text);
        else if (ev.e === "error") error = ev.message;
        else if (ev.e === "card") {
          n++; setPlacing(null);
          // Already saved by the server; show it now rather than on the next poll.
          const card = { ...ev.card, ax: at.x, ay: at.y, x: at.x, y: at.y } as Card;
          setDossier((d) => d.cards.some((c) => c.id === card.id) ? d : { ...d, cards: [...d.cards, card] });
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") error = "The connection dropped. Anything already filed is kept.";
    }
    setBusy(null); setPlacing(null);
    if (error) say(error, true); else if (!n && !ctl.current.signal.aborted) say("Nothing new came back for that card. Try another one.");
  }

  async function findImages(id: string, at: Pos) {
    const parent = current.current.cards.find((c) => c.id === id);
    if (!parent) return;
    setPlacing({ ...at, label: "Finding images…", from: id });
    setBusy(`Finding images of “${parent.title ?? "card"}”…`);
    ctl.current = new AbortController();
    try {
      const res = await fetch("/api/images", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.current.signal,
        body: JSON.stringify({ dossier_id: initial.id, card_id: id, at }),
      });
      const r = (await res.json().catch(() => ({}))) as { card?: Card | null; error?: string };
      if (!res.ok) say(r.error || "The server returned an error.", true);
      else if (!r.card) say("The search didn’t turn up any usable images for that card.");
      else { const card = r.card; setDossier((d) => d.cards.some((c) => c.id === card.id) ? d : { ...d, cards: [...d.cards, card] }); }
    } catch (e) {
      if ((e as Error).name !== "AbortError") say("Couldn’t reach the server. Try again in a moment.", true);
    }
    setBusy(null); setPlacing(null);
  }

  const act = (kind: Action, id: string, at?: Pos) => {
    if (busy || !isOwner || example || !board.current) return;
    setNote(null);
    // A click has no drop spot: pick a free one now, so the server can save where the branch starts.
    const spot = at ?? board.current.freeSpot(id);
    void (kind === "dig" ? dig(id, spot) : findImages(id, spot));
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  const empty = dossier.cards.length <= 1 && !dossier.cards[0]?.body;

  return (
    <>
      <div className="bar">
        <Link className="mark" href="/"><i />Dossier</Link>
        <div className="fileline"><b>{fileNo(dossier)}</b> · {dossier.title}{example ? " · example" : ""}</div>
        {live && <span className="live" title="This board updates as your agent writes to it">live</span>}
        {!example && <button className="btn" type="button" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>}
      </div>
      <main>
        <Board ref={board} dossier={dossier} canDig={isOwner && !example && !busy} readOnly={!isOwner || !!example}
          bottomPad={0} pending={placing} onChange={onBoardChange} onAct={act} />
        {empty && <div className="waiting"><span className="pulse" />Waiting for your agent to file the first cards…</div>}
        {(busy || note) && (
          <div className={`toast${note?.err && !busy ? " err" : ""}`} role="status">
            {busy ? <><i className="pulse" /><span>{busy}</span><button type="button" onClick={() => ctl.current?.abort()}>Stop</button></>
              : <><span>{note!.text}</span><button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></>}
          </div>
        )}
      </main>
    </>
  );
}
