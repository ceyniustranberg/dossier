import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { previewImage, publicUrl } from "./og.ts";

/**
 * `/api/images` fetches pages the web search cited and shows their preview images. `publicUrl`
 * is what stops that from being pointed at the server's own network, and `previewImage` is what
 * decides which picture a page offers.
 */

describe("publicUrl", () => {
  test("accepts ordinary public pages", () => {
    assert.ok(publicUrl("https://en.wikipedia.org/wiki/Espresso"));
    assert.ok(publicUrl("http://example.com/a?b=c"));
  });

  test("refuses anything that could reach a private network", () => {
    for (const u of [
      "http://localhost:3000/", "http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data",
      "http://[::1]/", "http://router.local/", "http://db.internal/", "http://intranet/", "https://user:pw@example.com/",
    ]) assert.equal(publicUrl(u), null, u);
  });

  test("refuses non-web schemes", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/", "javascript:alert(1)", "data:text/html,hi"]) assert.equal(publicUrl(u), null, u);
  });
});

describe("previewImage", () => {
  const page = "https://news.example.com/story/1";

  test("reads og:image regardless of attribute order and quoting", () => {
    assert.equal(previewImage(`<meta property="og:image" content="https://cdn.example.com/a.jpg">`, page)?.src, "https://cdn.example.com/a.jpg");
    assert.equal(previewImage(`<META content='https://cdn.example.com/b.jpg' property='og:image' />`, page)?.src, "https://cdn.example.com/b.jpg");
  });

  test("resolves relative URLs and decodes entities", () => {
    assert.equal(previewImage(`<meta property="og:image" content="/img/c.jpg?w=1&amp;h=2">`, page)?.src, "https://news.example.com/img/c.jpg?w=1&h=2");
  });

  test("falls back to the Twitter card image", () => {
    assert.equal(previewImage(`<meta name="twitter:image" content="https://cdn.example.com/t.png">`, page)?.src, "https://cdn.example.com/t.png");
  });

  test("skips images the board could not or should not show", () => {
    assert.equal(previewImage(`<meta property="og:image" content="http://cdn.example.com/insecure.jpg">`, page), null);
    assert.equal(previewImage(`<meta property="og:image" content="https://cdn.example.com/logo.svg">`, page), null);
    assert.equal(previewImage(`<meta property="og:image" content="https://127.0.0.1/x.jpg">`, page), null);
    assert.equal(previewImage(`<html><head><title>No image</title></head></html>`, page), null);
  });

  test("skips site logos and placeholders, which say nothing about the topic", () => {
    for (const src of [
      "https://upload.wikimedia.org/thumb/5/53/Gaggia_logo.svg/1280px-Gaggia_logo.svg.png",
      "https://cdn.shopify.com/files/Gaggia_-_NA-Logo_f98fd537.png?width=1200",
      "https://cdn.example.com/static/default-share.jpg",
      "https://cdn.example.com/favicon-512.png",
    ]) assert.equal(previewImage(`<meta property="og:image" content="${src}">`, page), null, src);
    // ...without catching ordinary photos whose names merely contain those letters
    for (const src of ["https://cdn.example.com/photos/iconic-espresso-bar.jpg", "https://cdn.example.com/catalogue/machine.jpg"])
      assert.equal(previewImage(`<meta property="og:image" content="${src}">`, page)?.src, src);
  });

  test("picks up the alt text and page title", () => {
    const r = previewImage(`<title>Fallback</title><meta property="og:title" content="Real &amp; Title"><meta property="og:image" content="https://cdn.example.com/a.jpg"><meta property="og:image:alt" content="A cup">`, page);
    assert.deepEqual(r, { src: "https://cdn.example.com/a.jpg", alt: "A cup", title: "Real & Title" });
  });
});
