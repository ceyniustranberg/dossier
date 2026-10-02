import type { Card, Dossier, Sizes, Tab } from "./types";

export const CW = 340, GAP = 14, CLW = CW * 2 + GAP, CLGAP = 80, ROOTW = 540, TABH = 40, RING = 120;

const sizeOf = (sizes: Sizes, c: Card) => sizes[c.id] ?? { w: c.t === "summary" ? ROOTW : CW, h: 140 };

type Rect = { x: number; y: number; w: number; h: number };

/** True when two rects are closer than GAP, i.e. they would touch or overlap on the board. */
const hits = (a: Rect, b: Rect) => a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;

/**
 * Slide `r` vertically (down for dir 1, up for -1) until it clears every obstacle, and return its y.
 * y only ever moves one way and each jump lands past an obstacle, so this always terminates.
 */
function clearY(r: Rect, obstacles: Rect[], dir: 1 | -1): number {
  let y = r.y;
  for (let again = true; again;) {
    again = false;
    for (const o of obstacles) {
      if (!hits({ ...r, y }, o)) continue;
      y = dir > 0 ? o.y + o.h + GAP : o.y - r.h - GAP;
      again = true;
    }
  }
  return y;
}

/**
 * Pure auto-layout. The summary sits at the origin on the left, clusters run in a row to its right
 * as two-column masonry stacks hanging under a folder tab, and "dig deeper" branches stack in a column
 * from their anchor. Cards the user has dragged (`moved`) are never touched. Auto-placed cards
 * skip past anything already on the board, so a new card never lands on top of another.
 * Returns the same object when nothing changed, so it is safe to call after every render.
 */
export function relayout(d: Dossier, sizes: Sizes): Dossier {
  const root = d.cards.find((c) => c.id === "root");
  const pos = new Map<string, { x: number; y: number }>();
  if (root && !root.moved) pos.set("root", { x: 0, y: 0 });
  const rectOf = (c: Card): Rect => ({ ...(pos.get(c.id) ?? c), ...sizeOf(sizes, c) });

  // Cluster stacks flow around the summary and anything the user has dragged into their path.
  const fixed: Rect[] = d.cards.filter((c) => c.moved || c.id === "root").map(rectOf);

  const tabs: Tab[] = d.clusters.map((_, i) => {
    const x = ROOTW + RING + i * (CLW + CLGAP), tabY = 0;
    // Each column's free edge: where its next card's top goes.
    const start = tabY + TABH + GAP, edge = [start, start];
    for (const c of d.cards) {
      if (c.c !== i || c.moved || c.parent || c.t === "summary") continue;
      const h = sizeOf(sizes, c).h, j = edge[1] < edge[0] ? 1 : 0, cx = x + j * (CW + GAP);
      const y = clearY({ x: cx, y: edge[j], w: CW, h }, fixed, 1);
      pos.set(c.id, { x: cx, y });
      edge[j] = y + h + GAP;
    }
    return { x, y: tabY, top: false };
  });

  // Branch columns go last and step down past every card and tab already placed, including earlier branches.
  const isBranch = (c: Card) => !!c.parent && !c.moved && c.ax != null && c.ay != null;
  const taken: Rect[] = [...d.cards.filter((c) => !isBranch(c)).map(rectOf), ...tabs.map((t) => ({ x: t.x, y: t.y, w: CLW, h: TABH }))];
  const branchY = new Map<string, number>();
  for (const c of d.cards) {
    if (!isBranch(c)) continue;
    const key = `${c.parent}:${c.ax}:${c.ay}`, z = sizeOf(sizes, c);
    const y = clearY({ x: c.ax!, y: branchY.get(key) ?? c.ay!, ...z }, taken, 1);
    pos.set(c.id, { x: c.ax!, y });
    taken.push({ x: c.ax!, y, ...z });
    branchY.set(key, y + z.h + GAP);
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

export function bounds(d: Dossier, sizes: Sizes): Rect | null {
  if (!d.cards.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (r: Rect) => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); };
  d.cards.forEach((c) => add({ x: c.x, y: c.y, ...sizeOf(sizes, c) }));
  d.tabs.forEach((t) => add({ x: t.x, y: t.y, w: CLW, h: TABH }));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Find an empty column near `parent`, preferring spots to its right, the way the board grows. */
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
    const leftward = cx < pcx ? 500 : 0;
    cands.push({ x, y, d: Math.hypot(cx - pcx, cy - pcy) + leftward });
  }
  cands.sort((a, b) => a.d - b.d);
  const hit = (c: { x: number; y: number }, r: Rect) =>
    c.x < r.x + r.w + 24 && c.x + need.w + 24 > r.x && c.y < r.y + r.h + 24 && c.y + need.h + 24 > r.y;
  const free = cands.find((c) => !rects.some((r) => hit(c, r)));
  if (free) return { x: free.x, y: free.y };
  // Nowhere nearby: start a column just past the right edge of the board.
  const b = bounds(d, sizes)!;
  return { x: b.x + b.w + 50, y: p.y };
}

export { sizeOf };
