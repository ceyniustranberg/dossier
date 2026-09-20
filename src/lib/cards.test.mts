import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normUrl, sanitizeCard } from "./cards.ts";

/**
 * `sanitizeCard` is the boundary between what Claude wrote and what the board shows.
 * Its job is to guarantee the README's first promise: a card can only carry a URL that
 * the web search tool actually returned. These tests exist so that promise cannot be
 * refactored away silently.
 */

const ALLOWED = () =>
  new Map<string, string>([
    ["https://real.example/story", "A Real Story"],
    ["https://real.example/other", "Another Story"],
  ]);

/** sanitizeCard, asserting it did not reject the card. */
function must(o: Record<string, unknown>, allowed = ALLOWED()) {
  const c = sanitizeCard(o, allowed);
  if (!c) throw new Error(`expected a card, got null for ${JSON.stringify(o)}`);
  return c;
}

describe("normUrl", () => {
  test("trims, drops the fragment and drops one trailing slash", () => {
    assert.equal(normUrl("  https://a.test/x  "), "https://a.test/x");
    assert.equal(normUrl("https://a.test/x#section"), "https://a.test/x");
    assert.equal(normUrl("https://a.test/x/"), "https://a.test/x");
    assert.equal(normUrl("https://a.test/x/#section"), "https://a.test/x");
  });

  test("leaves an already-normal URL alone", () => {
    assert.equal(normUrl("https://a.test/x"), "https://a.test/x");
  });
});

describe("card type gating", () => {
  test("rejects an unknown type", () => {
    assert.equal(sanitizeCard({ t: "wormhole", title: "x" }, ALLOWED()), null);
  });

  test("rejects a missing type", () => {
    assert.equal(sanitizeCard({ title: "x" }, ALLOWED()), null);
  });

  test("rejects 'summary', which is handled as its own stream event, not as a card", () => {
    assert.equal(sanitizeCard({ t: "summary", body: "x" }, ALLOWED()), null);
  });

  test("accepts every type the board can render", () => {
    for (const t of ["fact", "stat", "timeline", "player", "lead", "debate", "question", "chart", "picture"]) {
      assert.equal(must({ t, title: "x" }).t, t, `type ${t} should survive`);
    }
  });
});

describe("URL allow-list — the no-invented-links guarantee", () => {
  test("drops a URL that web search never returned", () => {
    const c = must({ t: "fact", title: "x", url: "https://invented.example/nope" });
    assert.ok(!("url" in c), "a URL outside the allow-list must not reach the board");
  });

  test("keeps a URL that web search returned", () => {
    const c = must({ t: "article", title: "x", url: "https://real.example/story" });
    assert.equal(c.url, "https://real.example/story");
    assert.equal(c.t, "article");
  });

  test("downgrades an article with no verifiable URL to an unverified lead", () => {
    const c = must({ t: "article", title: "Headline", url: "https://invented.example/nope" });
    assert.equal(c.t, "lead", "an article without a real URL must become a lead");
    assert.ok(!("url" in c));
  });

  test("downgrades an article that supplied no URL at all", () => {
    const c = must({ t: "article", title: "Headline" });
    assert.equal(c.t, "lead");
  });

  test("does not change the type of a non-article whose URL was dropped", () => {
    const c = must({ t: "player", title: "x", url: "https://invented.example/nope" });
    assert.equal(c.t, "player");
  });

  test("matches the allow-list modulo trailing slash and fragment", () => {
    for (const u of [
      "https://real.example/story/",
      "https://real.example/story#top",
      "https://real.example/story/#top",
      "  https://real.example/story  ",
    ]) {
      const c = must({ t: "article", title: "x", url: u });
      assert.equal(c.t, "article", `${u} should match the allow-list`);
      assert.equal(c.url, u.trim(), "the original URL is preserved, only trimmed");
    }
  });

  test("ignores a non-string URL instead of throwing", () => {
    for (const url of [42, null, { href: "https://real.example/story" }, ["https://real.example/story"]]) {
      const c = must({ t: "fact", title: "x", url });
      assert.ok(!("url" in c), `${JSON.stringify(url)} must not produce a link`);
    }
  });

  test("an empty allow-list lets no URL through", () => {
    const c = must({ t: "article", title: "x", url: "https://real.example/story" }, new Map());
    assert.equal(c.t, "lead");
    assert.ok(!("url" in c));
  });
});

describe("sources", () => {
  test("keeps only allow-listed sources, titled from the allow-list", () => {
    const c = must({
      t: "fact",
      title: "x",
      sources: ["https://real.example/story", "https://invented.example/nope"],
    });
    assert.deepEqual(c.sources, [{ url: "https://real.example/story", title: "A Real Story" }]);
  });

  test("omits the key entirely when nothing survives", () => {
    const c = must({ t: "fact", title: "x", sources: ["https://invented.example/nope"] });
    assert.ok(!("sources" in c), "an empty source list should be absent, not []");
  });

  test("does not repeat the card's own URL as a source", () => {
    const c = must({
      t: "article",
      title: "x",
      url: "https://real.example/story",
      sources: ["https://real.example/story", "https://real.example/other"],
    });
    assert.deepEqual(c.sources, [{ url: "https://real.example/other", title: "Another Story" }]);
  });

  test("caps at two sources", () => {
    const allowed = new Map<string, string>([
      ["https://real.example/1", "One"],
      ["https://real.example/2", "Two"],
      ["https://real.example/3", "Three"],
    ]);
    const c = must(
      { t: "fact", title: "x", sources: ["https://real.example/1", "https://real.example/2", "https://real.example/3"] },
      allowed,
    );
    assert.equal(c.sources?.length, 2);
  });

  test("falls back to a generic title when the allow-list has no title", () => {
    const c = must({ t: "fact", title: "x", sources: ["https://real.example/untitled"] },
      new Map([["https://real.example/untitled", ""]]));
    assert.deepEqual(c.sources, [{ url: "https://real.example/untitled", title: "Source" }]);
  });

  test("ignores a non-array sources field", () => {
    const c = must({ t: "fact", title: "x", sources: "https://real.example/story" });
    assert.ok(!("sources" in c));
  });

  // Known gap. The dedupe compares raw strings (`u !== url`) while the allow-list matches on
  // normalised ones, so a trailing slash or fragment slips the same page past it and the card
  // links to it twice. Fix is `normUrl(u) !== normUrl(url ?? "")`; flip this off when it lands.
  test("does not repeat the card's own URL in a different spelling", { todo: "dedupe compares raw strings" }, () => {
    const c = must({
      t: "article",
      title: "x",
      url: "https://real.example/story",
      sources: ["https://real.example/story/"],
    });
    assert.ok(!("sources" in c), "the same page should not be both the link and a source");
  });
});

describe("search-query fallback", () => {
  test("a lead with no query falls back to its title, so 'Find coverage' still works", () => {
    assert.equal(must({ t: "lead", title: "Fusion funding" }).q, "Fusion funding");
  });

  test("an article downgraded to a lead inherits the query fallback", () => {
    const c = must({ t: "article", title: "Headline", url: "https://invented.example/nope" });
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
    const input = { t: "article", title: "x", url: "https://invented.example/nope" };
    const snapshot = structuredClone(input);
    sanitizeCard(input, ALLOWED());
    assert.deepEqual(input, snapshot);
  });
});
