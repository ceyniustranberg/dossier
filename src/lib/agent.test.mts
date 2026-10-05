import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { safeHref, sanitizeAgentCard } from "./cards.ts";
import { hashToken, looksLikeId, looksLikeToken, newId, newToken } from "./token.ts";

/**
 * Cards now arrive from the user's own agent over MCP, so the server has no search allow-list
 * to check links against. These pin down what it does check instead, and the token and id
 * helpers that stand between the public internet and the dossier tables.
 */

describe("sanitizeAgentCard", () => {
  test("keeps public links and marks the card as agent-written", () => {
    const c = sanitizeAgentCard({ t: "article", c: 1, title: "A story", url: "https://news.example.com/a", sources: [{ url: "https://other.example.org/b", title: "Other" }] });
    assert.equal(c?.t, "article");
    assert.equal(c?.url, "https://news.example.com/a");
    assert.deepEqual(c?.sources, [{ url: "https://other.example.org/b", title: "Other" }]);
    assert.equal(c?.via, "agent");
  });

  test("drops links the server should not render, and an article without one becomes a lead", () => {
    for (const url of ["javascript:alert(1)", "http://localhost:3000/x", "http://10.0.0.1/", "file:///etc/passwd", "not a url"]) {
      const c = sanitizeAgentCard({ t: "article", c: 0, title: "Headline", url });
      assert.equal(c?.t, "lead", url);
      assert.equal(c?.url, undefined, url);
    }
  });

  test("names a source after its host when the agent gave no title", () => {
    assert.deepEqual(sanitizeAgentCard({ t: "fact", c: 0, sources: ["https://www.example.com/x"] })?.sources, [{ url: "https://www.example.com/x", title: "example.com" }]);
  });

  test("refuses unknown types, including the server-only gallery", () => {
    assert.equal(sanitizeAgentCard({ t: "gallery", c: 0 }), null);
    assert.equal(sanitizeAgentCard({ t: "script", c: 0 }), null);
  });
});

describe("safeHref", () => {
  test("passes http(s), drops everything else", () => {
    assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
    assert.equal(safeHref("javascript:alert(1)"), undefined);
    assert.equal(safeHref("data:text/html,x"), undefined);
    assert.equal(safeHref(undefined), undefined);
  });
});

describe("tokens and ids", () => {
  test("tokens have the advertised shape and are hashed deterministically", () => {
    const t = newToken();
    assert.ok(looksLikeToken(t), t);
    assert.equal(hashToken(t), hashToken(t));
    assert.notEqual(hashToken(t), hashToken(newToken()));
    assert.match(hashToken(t), /^[0-9a-f]{64}$/);
  });

  test("junk never reaches the database lookup", () => {
    for (const t of [undefined, "", "Bearer x", "dsr_short", "dsr_" + "a".repeat(43) + "'; drop table"]) assert.equal(looksLikeToken(t), false, String(t));
  });

  test("dossier ids are 22 base62 characters and do not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    assert.equal(ids.size, 500);
    for (const id of ids) assert.ok(looksLikeId(id) && id.length === 22, id);
    assert.equal(looksLikeId("../etc"), false);
  });
});
