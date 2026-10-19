import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import discogsRoutes from "../src/routes/discogs.js";

const request = globalThis.fetch;
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use("/api/discogs", discogsRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ message: error.message });
  });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/discogs/search`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test("barcode lookup preserves leading zeros, pagination and release filters", async (t) => {
  let upstreamUrl;
  const payload = {
    results: [{ id: 123, title: "Artist - Album" }],
    pagination: { page: 2, pages: 3, items: 25 },
  };
  t.mock.method(globalThis, "fetch", async (url) => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify(payload), {
      headers: { "X-Discogs-Ratelimit-Remaining": "59" },
    });
  });

  const response = await request(
    `${baseUrl}?barcode=0%20602567-988724&page=2&per_page=12`
  );
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.origin, "https://api.discogs.com");
  assert.equal(upstreamUrl.pathname, "/database/search");
  assert.equal(upstreamUrl.searchParams.get("barcode"), "0602567988724");
  assert.equal(upstreamUrl.searchParams.get("type"), "release");
  assert.equal(upstreamUrl.searchParams.get("format"), "Vinyl");
  assert.equal(upstreamUrl.searchParams.get("page"), "2");
  assert.equal(upstreamUrl.searchParams.get("per_page"), "12");
  assert.equal(upstreamUrl.searchParams.has("q"), false);
  const data = await response.json();
  assert.deepEqual(data.results, payload.results);
  assert.deepEqual(data.pagination, payload.pagination);
  assert.equal(data.rateLimit.remaining, "59");
});

test("invalid barcodes never issue an unfiltered Discogs search", async (t) => {
  const upstream = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Discogs must not be called");
  });
  for (const query of [
    "barcode=",
    "barcode=12345",
    "barcode=not-a-barcode",
    "barcode=0000000000000",
    "barcode=602567988724&barcode=4606344052772",
  ]) {
    const response = await request(`${baseUrl}?${query}`);
    assert.equal(response.status, 400, query);
    assert.match((await response.json()).message, /EAN\/UPC/);
  }
  assert.equal(upstream.mock.callCount(), 0);
});

test("text search still forwards text without a barcode", async (t) => {
  let upstreamUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    upstreamUrl = new URL(url);
    return new Response(JSON.stringify({ results: [], pagination: { items: 0 } }));
  });
  const response = await request(`${baseUrl}?q=Queen`);
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl.searchParams.get("q"), "Queen");
  assert.equal(upstreamUrl.searchParams.has("barcode"), false);
});

test("Discogs failures are passed to the existing error handler", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ message: "Rate limit reached" }), { status: 429 })
  );
  const response = await request(`${baseUrl}?barcode=602567988724`);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).message, "Rate limit reached");
});
