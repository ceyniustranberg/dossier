"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { CLW, TABH, bounds, freeSpot, relayout, sizeOf } from "@/lib/layout";
import type { Dossier, Sizes } from "@/lib/types";
import { CardView } from "./CardView";

export interface BoardHandle {
  /** Re-centre the whole board in the viewport. */
  fit: () => void;
  /** An empty spot near a card, for a new branch column. */
  freeSpot: (parentId: string) => { x: number; y: number };
}

interface Props {
  dossier: Dossier;
  canDig: boolean;
  /** Pixels at the bottom of the viewport covered by the chat panel (narrow screens). */
  bottomPad: number;
  onChange: (next: Dossier, byUser: boolean) => void;
  onDig: (id: string) => void;
}

type View = { x: number; y: number; s: number };
type Drag = { id: string | null; sx: number; sy: number; ox: number; oy: number; moved: boolean };
const clampS = (s: number) => Math.max(0.1, Math.min(2.2, s));

export const Board = forwardRef<BoardHandle, Props>(function Board({ dossier, canDig, bottomPad, onChange, onDig }, ref) {
  const vp = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [sizes, setSizes] = useState<Sizes>({});
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
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

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
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
  if (root) {
    const r = sizeOf(sizes, root);
    dossier.tabs.forEach((t) => {
      const x1 = root.x + r.w / 2, y1 = t.top ? root.y : root.y + r.h, x2 = t.x + CLW / 2, y2 = t.top ? t.y + TABH : t.y, my = (y1 + y2) / 2;
      paths.push({ d: `M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}` });
    });
  }
  dossier.cards.forEach((c) => {
    const other = c.parent ?? c.rel;
    if (!other || other === c.id) return;
    const a = centre(c.id), b = centre(other);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2;
    paths.push({ d: `M${a.x} ${a.y} C${mx} ${a.y},${mx} ${b.y},${b.x} ${b.y}`, cls: c.parent ? "kid" : "rel" });
  });

  const centreZoom = (f: number) => { const el = vp.current; if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, f); };

  return (
    <>
      <div
        ref={vp}
        className="vp"
        style={{ backgroundSize: `${28 * view.s}px ${28 * view.s}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      >
        <div className="world" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.s})` }}>
          <svg className="links" aria-hidden="true">{paths.map((p, i) => <path key={i} d={p.d} className={p.cls} />)}</svg>
          {dossier.tabs.map((t, i) => (
            <div className="tab" key={i} style={{ left: t.x, top: t.y, width: CLW }}>
              <span>{String(i + 1).padStart(2, "0")}</span>{dossier.clusters[i]}
            </div>
          ))}
          {dossier.cards.map((c) => (
            <CardView key={c.id} card={c} example={!!dossier.example} createdAt={dossier.createdAt} fileTitle={dossier.title} canDig={canDig} dragging={dragId === c.id} z={zOrder[c.id]} onDig={onDig} measure={measure} />
          ))}
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
