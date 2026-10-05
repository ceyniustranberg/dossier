import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAgentCard } from "./cards.ts";

/**
 * `sanitizeAgentCard` is the boundary between what the user's agent sent over MCP and what the
 * board shows. Link checks specific to agent cards (private hosts, javascript:, the agent-cited
 * mark) are in agent.test.mts; these cover the shape guarantees every card gets.
 */

/** sanitizeAgentCard, asserting it did not reject the card. */
function must(o: Record<string, unknown>) {
  const c = sanitizeAgentCard(o);
  if (!c) throw new Error(`expected a card, got null for ${JSON.stringify(o)}`);
  return c;
}

describe("card type gating", () => {
  test("rejects an unknown type", () => {
    assert.equal(sanitizeAgentCard({ t: "wormhole", title: "x" }), null);
  });

  test("rejects a missing type", () => {
    assert.equal(sanitizeAgentCard({ title: "x" }), null);
  });

  test("rejects 'summary', which is written with update_dossier, not as a card", () => {
    assert.equal(sanitizeAgentCard({ t: "summary", body: "x" }), null);
  });

  test("accepts every type the board can render", () => {
    for (const t of ["fact", "stat", "timeline", "player", "lead", "debate", "question", "chart", "picture"]) {
      assert.equal(must({ t, title: "x" }).t, t, `type ${t} should survive`);
    }
  });
});

describe("links", () => {
  test("keeps a public article URL", () => {
    const c = must({ t: "article", title: "x", url: "https://real.example/story" });
    assert.equal(c.url, "https://real.example/story");
    assert.equal(c.t, "article");
  });

  test("downgrades an article that supplied no URL to a lead", () => {
    const c = must({ t: "article", title: "Headline" });
    assert.equal(c.t, "lead");
  });

  test("does not change the type of a non-article whose URL was dropped", () => {
    const c = must({ t: "player", title: "x", url: "javascript:alert(1)" });
    assert.equal(c.t, "player");
    assert.ok(!("url" in c));
  });

  test("trims surrounding whitespace", () => {
    assert.equal(must({ t: "article", title: "x", url: "  https://real.example/story  " }).url, "https://real.example/story");
  });

  test("ignores a non-string URL instead of throwing", () => {
    for (const url of [42, null, { href: "https://real.example/story" }, ["https://real.example/story"]]) {
      const c = must({ t: "fact", title: "x", url });
      assert.ok(!("url" in c), `${JSON.stringify(url)} must not produce a link`);
    }
  });
});

describe("sources", () => {
  test("keeps only usable sources, titled by the agent or after their host", () => {
    const c = must({
      t: "fact",
      title: "x",
      sources: [{ url: "https://real.example/story", title: "A Real Story" }, "http://localhost/x", "https://www.other.example/y"],
    });
    assert.deepEqual(c.sources, [
      { url: "https://real.example/story", title: "A Real Story" },
      { url: "https://www.other.example/y", title: "other.example" },
    ]);
  });

  test("omits the key entirely when nothing survives", () => {
    const c = must({ t: "fact", title: "x", sources: ["file:///etc/passwd"] });
    assert.ok(!("sources" in c), "an empty source list should be absent, not []");
  });

  test("does not repeat the card's own URL as a source", () => {
    const c = must({
      t: "article",
      title: "x",
      url: "https://real.example/story",
      sources: ["https://real.example/story", "https://real.example/other"],
    });
    assert.deepEqual(c.sources?.map((s) => s.url), ["https://real.example/other"]);
  });

  test("does not repeat the card's own URL in a different spelling", () => {
    const c = must({
      t: "article",
      title: "x",
      url: "https://real.example/story",
      sources: ["https://real.example/story/", "https://real.example/story#top"],
    });
    assert.ok(!("sources" in c), "the same page should not be both the link and a source");
  });

  test("caps at two sources", () => {
    const c = must({ t: "fact", title: "x", sources: ["https://real.example/1", "https://real.example/2", "https://real.example/3"] });
    assert.equal(c.sources?.length, 2);
  });

  test("ignores a non-array sources field", () => {
    const c = must({ t: "fact", title: "x", sources: "https://real.example/story" });
    assert.ok(!("sources" in c));
  });
});

describe("search-query fallback", () => {
  test("a lead with no query falls back to its title, so 'Find coverage' still works", () => {
    assert.equal(must({ t: "lead", title: "Fusion funding" }).q, "Fusion funding");
  });

  test("an article downgraded to a lead inherits the query fallback", () => {
    const c = must({ t: "article", title: "Headline", url: "javascript:alert(1)" });
    assert.equal(c.t, "lead");
    assert.equal(c.q, "Headline", "the downgraded card still needs a search query");
  });

  test("an explicit query wins over the title", () => {
    assert.equal(must({ t: "lead", title: "Title", q: "better query" }).q, "better query");
  });

  test("a type that has no search link gets no query", () => {
    assert.ok(!("q" in must({ t: "fact", title: "x" })));
  });
});

describe("field clamping", () => {
  test("truncates long strings to their per-field limits", () => {
    const long = "z".repeat(5000);
    const c = must({ t: "fact", id: long, title: long, body: long, num: long, role: long, note: long, outlet: long, date: long, unit: long, rel: long });
    assert.equal(c.id.length, 24);
    assert.equal(c.title?.length, 200);
    assert.equal(c.body?.length, 1200);
    assert.equal(c.num?.length, 40);
    assert.equal(c.role?.length, 120);
    assert.equal(c.note?.length, 300);
    assert.equal(c.outlet?.length, 80);
    assert.equal(c.date?.length, 40);
    assert.equal(c.unit?.length, 20);
    assert.equal(c.rel?.length, 24);
  });

  test("coerces numbers to strings", () => {
    assert.equal(must({ t: "stat", num: 42, title: "x" }).num, "42");
  });

  test("defaults a missing id to an empty string, for the caller to replace", () => {
    assert.equal(must({ t: "fact", title: "x" }).id, "");
  });

  test("drops non-string, non-number values rather than stringifying them", () => {
    const c = must({ t: "fact", title: { nested: true }, body: ["a"] });
    assert.ok(!("title" in c));
    assert.ok(!("body" in c));
  });
});

describe("cluster index", () => {
  test("clamps to a non-negative integer", () => {
    assert.equal(must({ t: "fact", c: -3, title: "x" }).c, 0);
    assert.equal(must({ t: "fact", c: 2.9, title: "x" }).c, 2);
    assert.equal(must({ t: "fact", c: "3", title: "x" }).c, 3);
  });

  test("falls back to 0 when absent or unparseable", () => {
    assert.equal(must({ t: "fact", title: "x" }).c, 0);
    assert.equal(must({ t: "fact", c: "abc", title: "x" }).c, 0);
  });
});

describe("timeline items", () => {
  test("caps at eight entries", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ when: String(i), what: "event" }));
    assert.equal(must({ t: "timeline", title: "x", items }).items?.length, 8);
  });

  test("fills missing fields with empty strings rather than undefined", () => {
    const c = must({ t: "timeline", title: "x", items: [{ when: "1956" }, {}] });
    assert.deepEqual(c.items, [{ when: "1956", what: "" }, { when: "", what: "" }]);
  });

  test("ignores a non-array items field", () => {
    assert.ok(!("items" in must({ t: "timeline", title: "x", items: "1956: something" })));
  });
});

describe("chart bars", () => {
  test("caps at six bars", () => {
    const bars = Array.from({ length: 12 }, (_, i) => ({ label: `b${i}`, value: i }));
    assert.equal(must({ t: "chart", title: "x", bars }).bars?.length, 6);
  });

  test("drops bars whose value is not a finite number", () => {
    const c = must({
      t: "chart",
      title: "x",
      bars: [{ label: "good", value: 10 }, { label: "nan", value: "abc" }, { label: "null", value: null }, { label: "inf", value: Infinity }],
    });
    assert.deepEqual(c.bars?.map((b) => b.label), ["good", "null"],
      "null coerces to 0, which is finite; NaN and Infinity are dropped");
  });

  test("keeps a zero value, which is meaningful on a chart", () => {
    const c = must({ t: "chart", title: "x", bars: [{ label: "zero", value: 0 }] });
    assert.deepEqual(c.bars, [{ label: "zero", value: 0 }]);
  });
});

describe("output shape", () => {
  test("contains no undefined values, so the card serialises cleanly to the browser", () => {
    const c = must({ t: "fact", title: "x" });
    assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
    for (const [k, v] of Object.entries(c)) assert.notEqual(v, undefined, `${k} should be absent, not undefined`);
  });

  test("does not mutate the input object", () => {
    const input = { t: "article", title: "x", url: "javascript:alert(1)", sources: ["https://real.example/a"] };
    const snapshot = structuredClone(input);
    sanitizeAgentCard(input);
    assert.deepEqual(input, snapshot);
  });
});
