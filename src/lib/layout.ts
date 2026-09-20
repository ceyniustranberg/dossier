import type { Card, Dossier, Sizes, Tab } from "./types";

export const CW = 250, GAP = 14, CLW = CW * 2 + GAP, CLGAP = 80, ROOTW = 420, TABH = 40, RING = 120;

const sizeOf = (sizes: Sizes, c: Card) => sizes[c.id] ?? { w: c.t === "summary" ? ROOTW : CW, h: 140 };

/**
 * Pure auto-layout. The summary sits at the origin, clusters fan out above and below it as
 * two-column masonry stacks under a folder tab, and "dig deeper" branches stack in a column
 * from their anchor. Cards the user has dragged (`moved`) are never touched.
 * Returns the same object when nothing changed, so it is safe to call after every render.
 */
export function relayout(d: Dossier, sizes: Sizes): Dossier {
  const root = d.cards.find((c) => c.id === "root");
  const ch = root ? sizeOf(sizes, root).h : 220;
  const pos = new Map<string, { x: number; y: number }>();
  if (root && !root.moved) pos.set("root", { x: -ROOTW / 2, y: Math.round(-ch / 2) });

  const n = d.clusters.length, top = Math.ceil(n / 2);
  const tabs: Tab[] = d.clusters.map((_, i) => {
    const isTop = i < top, m = isTop ? top : n - top, k = isTop ? i : i - top;
    const x = Math.round((k - (m - 1) / 2) * (CLW + CLGAP) - CLW / 2);
    const tabY = Math.round(isTop ? -ch / 2 - RING - TABH : ch / 2 + RING);
    const cols = [0, 0];
    for (const c of d.cards) {
      if (c.c !== i || c.moved || c.parent || c.t === "summary") continue;
      const h = sizeOf(sizes, c).h, j = cols[1] < cols[0] ? 1 : 0;
      pos.set(c.id, { x: x + j * (CW + GAP), y: isTop ? tabY - GAP - cols[j] - h : tabY + TABH + GAP + cols[j] });
      cols[j] += h + GAP;
    }
    return { x, y: tabY, top: isTop };
  });

  const branchY = new Map<string, number>();
  for (const c of d.cards) {
    if (!c.parent || c.moved || c.ax == null || c.ay == null) continue;
    const key = `${c.parent}:${c.ax}:${c.ay}`, y = branchY.get(key) ?? c.ay;
    pos.set(c.id, { x: c.ax, y });
    branchY.set(key, y + sizeOf(sizes, c).h + GAP);
  }

  let changed = tabs.length !== d.tabs.length || tabs.some((t, i) => t.x !== d.tabs[i].x || t.y !== d.tabs[i].y);
  const cards = d.cards.map((c) => {
    const p = pos.get(c.id);
    if (!p || (p.x === c.x && p.y === c.y)) return c;
    changed = true;
    return { ...c, x: p.x, y: p.y };
  });
  return changed ? { ...d, tabs, cards } : d;
}

type Rect = { x: number; y: number; w: number; h: number };

export function bounds(d: Dossier, sizes: Sizes): Rect | null {
  if (!d.cards.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (r: Rect) => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); };
  d.cards.forEach((c) => add({ x: c.x, y: c.y, ...sizeOf(sizes, c) }));
  d.tabs.forEach((t) => add({ x: t.x, y: t.y, w: CLW, h: TABH }));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Find an empty column near `parent`, preferring spots further from the board centre. */
export function freeSpot(d: Dossier, sizes: Sizes, parentId: string): { x: number; y: number } {
  const p = d.cards.find((c) => c.id === parentId);
  if (!p) return { x: 0, y: 0 };
  const rects: Rect[] = [
    ...d.cards.map((c) => ({ x: c.x, y: c.y, ...sizeOf(sizes, c) })),
    ...d.tabs.map((t) => ({ x: t.x, y: t.y, w: CLW, h: TABH })),
  ];
  const ps = sizeOf(sizes, p), pcx = p.x + ps.w / 2, pcy = p.y + ps.h / 2, need = { w: CW, h: 820 };
  const cands: { x: number; y: number; d: number }[] = [];
  for (let i = -7; i <= 7; i++) for (let j = -6; j <= 6; j++) {
    const x = p.x + i * (CW + 50), y = p.y + j * 260, cx = x + CW / 2, cy = y + 200;
    const inward = Math.hypot(cx, cy) < Math.hypot(pcx, pcy) ? 500 : 0;
    cands.push({ x, y, d: Math.hypot(cx - pcx, cy - pcy) + inward });
  }
  cands.sort((a, b) => a.d - b.d);
  const hit = (c: { x: number; y: number }, r: Rect) =>
    c.x < r.x + r.w + 24 && c.x + need.w + 24 > r.x && c.y < r.y + r.h + 24 && c.y + need.h + 24 > r.y;
  const free = cands.find((c) => !rects.some((r) => hit(c, r)));
  return free ? { x: free.x, y: free.y } : { x: p.x + (pcx >= 0 ? 1 : -1) * (CW + 50), y: p.y };
}

export { sizeOf };
