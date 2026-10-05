"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { CLW, CW, TABH, bounds, freeSpot, relayout, sizeOf } from "@/lib/layout";
import type { Action, Dossier, Sizes } from "@/lib/types";
import { CardView } from "./CardView";

export interface BoardHandle {
  /** Re-centre the whole board in the viewport. */
  fit: () => void;
  /** An empty spot near a card, for a new branch column. */
  freeSpot: (parentId: string) => { x: number; y: number };
}

/** A tile-sized outline on the board: where a dragged action will land, or where its result is on its way. */
export interface Ghost { x: number; y: number; label: string; from: string }

interface Props {
  dossier: Dossier;
  canDig: boolean;
  /** Pixels at the bottom of the viewport covered by the chat panel (narrow screens). */
  bottomPad: number;
  /** Placeholder for a result that is still being fetched. */
  pending: Ghost | null;
  /** Viewing someone else's dossier: card actions are hidden. Drags still work but are not saved. */
  readOnly?: boolean;
  onChange: (next: Dossier, byUser: boolean) => void;
  /** Run a card action. `at` is the board position it was dragged to, or absent for a plain click. */
  onAct: (kind: Action, id: string, at?: { x: number; y: number }) => void;
}

type View = { x: number; y: number; s: number };
type Drag = { id: string | null; sx: number; sy: number; ox: number; oy: number; moved: boolean; act?: { kind: Action; card: string } };
const ACT_LABEL: Record<Action, string> = { dig: "Drop to dig deeper here", images: "Drop to place images here" };
const clampS = (s: number) => Math.max(0.1, Math.min(2.2, s));

export const Board = forwardRef<BoardHandle, Props>(function Board({ dossier, canDig, bottomPad, pending, readOnly, onChange, onAct }, ref) {
  const vp = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [sizes, setSizes] = useState<Sizes>({});
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const [aim, setAim] = useState<Ghost | null>(null);
  const eatClick = useRef(false);
  const touched = useRef(false), zTop = useRef(10);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<Drag | null>(null);
  const pinch = useRef<{ d: number; s: number; wx: number; wy: number } | null>(null);
  const live = useRef({ dossier, sizes, view, bottomPad });
  useEffect(() => { live.current = { dossier, sizes, view, bottomPad }; });

  const measure = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el); else nodes.current.delete(id);
  }, []);

  const fitTo = useCallback((d: Dossier, sz: Sizes) => {
    const el = vp.current, b = bounds(d, sz);
    if (!el || !b) return;
    const W = el.clientWidth, H = el.clientHeight, padX = 24, padT = 24, padB = live.current.bottomPad + 24;
    const s = Math.max(0.12, Math.min(1, (W - padX * 2) / b.w, (H - padT - padB) / b.h));
    setView({ s, x: padX + (W - padX * 2 - b.w * s) / 2 - b.x * s, y: padT + (H - padT - padB - b.h * s) / 2 - b.y * s });
  }, []);

  useImperativeHandle(ref, () => ({
    fit: () => { touched.current = false; fitTo(live.current.dossier, live.current.sizes); },
    freeSpot: (id) => freeSpot(live.current.dossier, live.current.sizes, id),
  }), [fitTo]);

  // Measure every card after render, then let the pure layout place anything the user hasn't moved.
  useLayoutEffect(() => {
    const measured: Sizes = {};
    let same = true;
    nodes.current.forEach((el, id) => {
      const m = { w: el.offsetWidth, h: el.offsetHeight };
      measured[id] = m;
      if (!sizes[id] || sizes[id].w !== m.w || sizes[id].h !== m.h) same = false;
    });
    if (Object.keys(sizes).length !== Object.keys(measured).length) same = false;
    if (!same) { setSizes(measured); return; }
    const next = relayout(dossier, sizes);
    if (next !== dossier) onChange(next, false);
    else if (!touched.current) fitTo(dossier, sizes);
  }, [dossier, sizes, onChange, fitTo]);

  useEffect(() => { touched.current = false; }, [dossier.id]);

  useEffect(() => {
    const refit = () => { if (!touched.current) fitTo(live.current.dossier, live.current.sizes); };
    window.addEventListener("resize", refit);
    document.fonts?.ready.then(() => setSizes({}));
    return () => window.removeEventListener("resize", refit);
  }, [fitTo]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    touched.current = true;
    setView((v) => { const ns = clampS(v.s * factor), wx = (px - v.x) / v.s, wy = (py - v.y) / v.s; return { s: ns, x: px - wx * ns, y: py - wy * ns }; });
  }, []);

  useEffect(() => {
    const el = vp.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const rel = (e: React.PointerEvent) => { const r = vp.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // Where a dragged action tile would land: centred under the pointer, its top edge just above it.
  const dropAt = (p: { x: number; y: number }) => {
    const v = live.current.view;
    return { x: Math.round((p.x - v.x) / v.s - CW / 2), y: Math.round((p.y - v.y) / v.s - 20) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    // An action button: a click runs it as usual, a drag carries a ghost tile to wherever it is dropped.
    const btn = target.closest<HTMLButtonElement>("button[data-act]");
    if (btn) {
      const card = btn.closest<HTMLElement>("[data-id]")?.dataset.id;
      if (btn.disabled || !card || ptrs.current.size) return;
      const p = rel(e);
      ptrs.current.set(e.pointerId, p);
      drag.current = { id: null, sx: p.x, sy: p.y, ox: 0, oy: 0, moved: false, act: { kind: btn.dataset.act as Action, card } };
      return;
    }
    if (target.closest("a,button")) return;
    try { vp.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = rel(e);
    ptrs.current.set(e.pointerId, p);
    touched.current = true;
    const v = live.current.view;
    if (ptrs.current.size === 2) {
      drag.current = null; setDragId(null);
      const [a, b] = [...ptrs.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: v.s, wx: (mx - v.x) / v.s, wy: (my - v.y) / v.s };
    } else if (ptrs.current.size === 1) {
      const id = target.closest<HTMLElement>("[data-id]")?.dataset.id ?? null;
      const c = id ? live.current.dossier.cards.find((k) => k.id === id) : null;
      drag.current = { id: c ? c.id : null, sx: p.x, sy: p.y, ox: c ? c.x : v.x, oy: c ? c.y : v.y, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const p = rel(e);
    ptrs.current.set(e.pointerId, p);
    if (pinch.current && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, pc = pinch.current;
      const ns = clampS((pc.s * Math.hypot(a.x - b.x, a.y - b.y)) / pc.d);
      setView({ s: ns, x: mx - pc.wx * ns, y: my - pc.wy * ns });
      return;
    }
    const g = drag.current;
    if (!g) return;
    const dx = p.x - g.sx, dy = p.y - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    if (g.act) {
      // Capture only once it is a real drag, so a plain click still reaches the button.
      if (!g.moved) { g.moved = true; try { vp.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      setAim({ ...dropAt(p), label: ACT_LABEL[g.act.kind], from: g.act.card });
      return;
    }
    if (!g.moved) {
      g.moved = true;
      if (g.id) { const id = g.id; setDragId(id); setZOrder((z) => ({ ...z, [id]: ++zTop.current })); }
    }
    if (g.id) {
      const s = live.current.view.s, nx = Math.round(g.ox + dx / s), ny = Math.round(g.oy + dy / s), d = live.current.dossier;
      onChange({ ...d, cards: d.cards.map((c) => (c.id === g.id ? { ...c, x: nx, y: ny, moved: true } : c)) }, true);
    } else setView((v) => ({ ...v, x: g.ox + dx, y: g.oy + dy }));
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    if (ptrs.current.size < 2) pinch.current = null;
    const g = drag.current;
    if (!g || ptrs.current.size) return;
    drag.current = null; setDragId(null);
    if (g.act) {
      setAim(null);
      if (!g.moved) return;
      // The pointer-up after a drag can still produce a click on the button; swallow it this once.
      eatClick.current = true; setTimeout(() => { eatClick.current = false; }, 0);
      // Dropping over the chat panel or zoom controls, or a cancelled gesture, places nothing.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      if (e.type === "pointercancel" || !under?.closest(".vp")) return;
      onAct(g.act.kind, g.act.card, dropAt(rel(e)));
      return;
    }
    // A tap on a card while zoomed far out zooms in to read it.
    if (g.id && !g.moved && live.current.view.s < 0.55) {
      const c = live.current.dossier.cards.find((k) => k.id === g.id), el = vp.current;
      if (c && el) {
        const b = sizeOf(live.current.sizes, c), W = el.clientWidth, H = el.clientHeight - live.current.bottomPad;
        const s = Math.max(0.5, Math.min(1, (W - 32) / b.w));
        setView({ s, x: W / 2 - (c.x + b.w / 2) * s, y: Math.max(16 - c.y * s, H / 2 - (c.y + b.h / 2) * s) });
      }
    }
  };

  const root = dossier.cards.find((c) => c.id === "root");
  const centre = (id: string) => { const c = dossier.cards.find((k) => k.id === id); if (!c) return null; const z = sizeOf(sizes, c); return { x: c.x + z.w / 2, y: c.y + z.h / 2 }; };
  const paths: { d: string; cls?: string }[] = [];
  // One rail from the summary's right edge through the row of folder tabs, which paint over it.
  if (root && dossier.tabs.length) {
    const r = sizeOf(sizes, root), last = dossier.tabs[dossier.tabs.length - 1], ty = dossier.tabs[0].y + TABH / 2;
    const x1 = root.x + r.w, y1 = Math.min(Math.max(ty, root.y + 20), root.y + r.h - 20);
    paths.push({ d: y1 === ty ? `M${x1} ${ty} H${last.x}` : `M${x1} ${y1} C${x1 + 60} ${y1},${dossier.tabs[0].x - 60} ${ty},${dossier.tabs[0].x} ${ty} H${last.x}` });
  }
  // Branch wires leave the parent's dig port (the dot on its right edge) heading right, then curve
  // into the near side of the branch card, or of the ghost tile while it is being placed.
  const port = (id: string) => { const c = dossier.cards.find((k) => k.id === id); if (!c) return null; const z = sizeOf(sizes, c); return { x: c.x + z.w, y: c.y + z.h / 2 }; };
  const wire = (a: { x: number; y: number }, box: { x: number; y: number; w: number; h: number }) => {
    const right = box.x + box.w / 2 >= a.x, b = { x: right ? box.x : box.x + box.w, y: box.y + box.h / 2 };
    const k = Math.max(60, Math.abs(b.x - a.x) / 2);
    return `M${a.x} ${a.y} C${a.x + k} ${a.y},${b.x + (right ? -k : k)} ${b.y},${b.x} ${b.y}`;
  };
  for (const g of [aim, pending]) {
    const a = g && port(g.from);
    if (g && a) paths.push({ d: wire(a, { x: g.x, y: g.y, w: CW, h: 90 }), cls: "kid" });
  }
  dossier.cards.forEach((c) => {
    if (c.parent && c.parent !== c.id) {
      const a = port(c.parent);
      if (a) paths.push({ d: wire(a, { x: c.x, y: c.y, ...sizeOf(sizes, c) }), cls: "kid" });
      return;
    }
    if (!c.rel || c.rel === c.id) return;
    const a = centre(c.id), b = centre(c.rel);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2;
    paths.push({ d: `M${a.x} ${a.y} C${mx} ${a.y},${mx} ${b.y},${b.x} ${b.y}`, cls: "rel" });
  });

  const centreZoom = (f: number) => { const el = vp.current; if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, f); };

  return (
    <>
      <div
        ref={vp}
        className="vp"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={(e) => { if (eatClick.current) { eatClick.current = false; e.stopPropagation(); e.preventDefault(); } }}
      >
        <div className="world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.s})` }}>
          <svg className="links" aria-hidden="true">{paths.map((p, i) => <path key={i} d={p.d} className={p.cls} />)}</svg>
          {dossier.tabs.map((t, i) => (
            <div className="tab" key={i} style={{ left: t.x, top: t.y, width: CLW }}>
              <span>{String(i + 1).padStart(2, "0")}</span>{dossier.clusters[i]}
            </div>
          ))}
          {dossier.cards.map((c) => (
            <CardView key={c.id} card={c} example={!!dossier.example} createdAt={dossier.createdAt} fileTitle={dossier.title} canDig={canDig} readOnly={!!readOnly} dragging={dragId === c.id} z={zOrder[c.id]} onAct={onAct} measure={measure} />
          ))}
          {pending && <div className="ghost pending" style={{ left: pending.x, top: pending.y, width: CW }}>{pending.label}</div>}
          {aim && <div className="ghost" style={{ left: aim.x, top: aim.y, width: CW }}>{aim.label}</div>}
        </div>
      </div>
      <div className="zoom">
        <button type="button" aria-label="Zoom in" onClick={() => centreZoom(1.3)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => centreZoom(1 / 1.3)}>&minus;</button>
        <button type="button" className="fit" aria-label="Fit board to screen" onClick={() => { touched.current = false; fitTo(dossier, sizes); }}>FIT</button>
      </div>
    </>
  );
});
