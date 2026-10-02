import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CW, GAP, relayout } from "./layout.ts";
import type { Card, Dossier, Sizes } from "./types.ts";

/**
 * `relayout` places every card the user hasn't dragged. These tests pin down its one visual
 * promise: an auto-placed card never lands on top of another card or a folder tab.
 */

const card = (id: string, c: number, extra: Partial<Card> = {}): Card => ({ id, t: "fact", c, x: 0, y: 0, title: id, ...extra });

function board(cards: Card[], clusters = ["A", "B", "C", "D"]): Dossier {
  return { id: "d1", query: "q", brief: "q", title: "T", createdAt: 0, clusters, tabs: [], cards: [card("root", 0, { t: "summary" }), ...cards] };
}

/** Run layout to a fixed point, the way the board does after every render. */
function settle(d: Dossier, sizes: Sizes): Dossier {
  for (let i = 0; i < 10; i++) {
    const next = relayout(d, sizes);
    if (next === d) return d;
    d = next;
  }
  throw new Error("layout did not settle");
}

function overlaps(d: Dossier, sizes: Sizes): string[] {
  const size = (c: Card) => sizes[c.id] ?? { w: c.t === "summary" ? 540 : CW, h: 140 };
  const rects = d.cards.map((c) => ({ id: c.id, moved: !!c.moved, x: c.x, y: c.y, ...size(c) }));
  const out: string[] = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.moved && b.moved) continue; // two cards the user stacked on purpose
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) out.push(`${a.id} × ${b.id}`);
  }
  return out;
}

describe("relayout", () => {
  test("cluster stacks flow around a card the user dragged into their path", () => {
    let d = settle(board([card("a1", 2), card("a2", 2), card("a3", 2)]), {});
    // Pin a tall a1 where it already sits, so the rest of its cluster wants the very same spot.
    d = { ...d, cards: [...d.cards.map((c) => c.id === "a1" ? { ...c, moved: true } : c), card("a4", 2), card("a5", 2)] };
    d = settle(d, { a1: { w: CW, h: 400 } });
    assert.deepEqual(overlaps(d, { a1: { w: CW, h: 400 } }), []);
  });

  test("a branch longer than its reserved column steps past the cards below it", () => {
    let d = settle(board([card("a1", 2), card("a2", 2), card("a3", 2), card("a4", 2)]), {});
    const a1 = d.cards.find((c) => c.id === "a1")!;
    // Anchor a branch column directly on top of the cluster, as an old save or a tight board could.
    const kids = Array.from({ length: 6 }, (_, i) => card(`k${i}`, 2, { parent: "a1", ax: a1.x, ay: a1.y }));
    d = settle({ ...d, cards: [...d.cards, ...kids] }, {});
    assert.deepEqual(overlaps(d, {}), []);
  });

  test("two branches anchored at the same spot don't stack on each other", () => {
    let d = settle(board([card("a1", 0), card("b1", 1)]), {});
    const kids = [
      ...[0, 1, 2].map((i) => card(`x${i}`, 0, { parent: "a1", ax: 2000, ay: 0 })),
      ...[0, 1, 2].map((i) => card(`y${i}`, 1, { parent: "b1", ax: 2000, ay: 0 })),
    ];
    d = settle({ ...d, cards: [...d.cards, ...kids] }, {});
    assert.deepEqual(overlaps(d, {}), []);
  });

  test("the board grows left to right: summary first, then each cluster to the right of the last", () => {
    const d = settle(board([card("a1", 0), card("b1", 1), card("c1", 2), card("d1", 3)]), {});
    const root = d.cards.find((c) => c.id === "root")!;
    assert.deepEqual([root.x, root.y], [0, 0]);
    const xs = d.tabs.map((t) => t.x);
    assert.ok(xs[0] >= root.x + 540, "first cluster starts right of the summary");
    assert.deepEqual(xs, [...xs].sort((p, q) => p - q), "clusters run left to right in order");
    for (const c of d.cards.filter((k) => k.id !== "root")) {
      const t = d.tabs[c.c];
      assert.ok(c.x >= t.x && c.y > t.y, `${c.id} hangs below its own tab`);
    }
  });

  test("an untouched board keeps its tidy stacks", () => {
    const d = settle(board([card("a1", 2), card("a2", 2), card("a3", 2)]), {});
    const [a1, a2, a3] = ["a1", "a2", "a3"].map((id) => d.cards.find((c) => c.id === id)!);
    assert.equal(a2.x, a1.x + CW + GAP); // second column
    assert.equal(a3.y, a1.y + 140 + GAP); // straight under the first card
  });
});
