import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import express from "express";
import previewsRoutes from "../src/routes/previews.js";

const responses = new Map();
const requests = [];
const originalBase = process.env.ITUNES_API_BASE;
let upstream;
let server;
let baseUrl;

const song = (title, extra = {}) => ({
  kind: "song",
  trackId: 1,
  artistName: "The Beatles",
  trackName: title,
  collectionName: "Original Album",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  trackViewUrl: "https://music.apple.com/us/album/song/123?i=1",
  ...extra,
});

before(async () => {
  upstream = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url);
    const term = url.searchParams.get("term");
    const response = responses.get(`${url.searchParams.get("country")}:${term}`) || responses.get(term) || { results: [] };
    if (response.hang) return;
    res.writeHead(response.status || 200, { "Content-Type": "application/json" });
    res.end(response.body || JSON.stringify(response));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.ITUNES_API_BASE = `http://127.0.0.1:${upstream.address().port}`;

  const app = express();
  app.use("/api/previews", previewsRoutes);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/previews/search`;
});

after(async () => {
  if (originalBase === undefined) delete process.env.ITUNES_API_BASE;
  else process.env.ITUNES_API_BASE = originalBase;
  server.closeAllConnections();
  upstream.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => server.close(resolve)),
    new Promise((resolve) => upstream.close(resolve)),
  ]);
});

function search(title, extra = {}) {
  return fetch(`${baseUrl}?${new URLSearchParams({ artist: "The Beatles", title, ...extra })}`);
}

test("invalid or repeated query parameters do not call iTunes", async () => {
  const count = requests.length;
  for (const query of ["", "artist=The+Beatles", "artist=&title=Song", "artist=A&artist=B&title=Song",
    "artist=A&title=Song&album=A&album=B", `artist=A&title=${"x".repeat(301)}`,
    "artist=A&title=Song&duration=bad", "artist=A&title=Song&duration=1:99:00",
    "artist=A&title=Song&duration=4:23&duration=3:00",
    "artist=A&title=Song&ignore_album=1", "artist=A&title=Song&ignore_album=true&ignore_album=false"]) {
    const response = await fetch(`${baseUrl}?${query}`);
    assert.equal(response.status, 400, query);
  }
  assert.equal(requests.length, count);
});

test("matches Discogs artist names and prefers the requested album over another release or cover", async () => {
  responses.set("The Beatles Hey Jude", { results: [
    song("Hey Jude", { artistName: "Cover Band" }),
    song("Hey Jude", { trackId: 2 }),
    song("Hey Jude", { trackId: 3, collectionName: "Hey Jude" }),
  ] });
  const response = await search("Hey Jude", { artist: "The Beatles (2)", album: "Hey Jude" });
  assert.equal(response.status, 200);
  const { preview } = await response.json();
  assert.equal(preview.trackId, 3);
  assert.equal(preview.trackViewUrl, "https://music.apple.com/us/album/song/123?i=1");
  const url = requests.at(-1);
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("country"), "US");
  assert.equal(url.searchParams.get("media"), "music");
  assert.equal(url.searchParams.get("entity"), "song");
});

test("remaster labels do not prevent a match, but live and remix versions are not substituted", async () => {
  responses.set("The Beatles Let It Be", { results: [
    song("Let It Be - Live", { trackId: 4 }),
    song("Let It Be (Club Remix)", { trackId: 5 }),
    song("Let It Be (2009 Remastered)", { trackId: 6 }),
  ] });
  assert.equal((await (await search("Let It Be")).json()).preview.trackId, 6);
  responses.set("The Beatles Yesterday", { results: [song("Yesterday - Live")] });
  assert.deepEqual(await (await search("Yesterday")).json(), { preview: null });
});

test("missing previews and unsafe URLs are not exposed as playable tracks", async () => {
  responses.set("The Beatles Help!", { results: [
    song("Help!", { previewUrl: null }),
    song("Help!", { previewUrl: "https://untrusted.example/preview.m4a" }),
    song("Help!", { trackViewUrl: "javascript:alert(1)" }),
    song("Help!", { kind: "music-video" }),
  ] });
  assert.deepEqual(await (await search("Help!")).json(), { preview: null });
});

test("simultaneous lookups and negative results reuse the metadata cache", async () => {
  responses.set("The Beatles Something", { results: [song("Something")] });
  const count = requests.length;
  const results = await Promise.all([search("Something"), search("Something")]);
  assert.ok((await results[0].json()).preview);
  assert.ok((await results[1].json()).preview);
  assert.equal(requests.length, count + 1);
  await search("No Such Song");
  const cachedCount = requests.length;
  assert.deepEqual(await (await search("No Such Song")).json(), { preview: null });
  assert.equal(requests.length, cachedCount);
});

test("upstream errors remain retryable and rate limits are attributed to iTunes", async () => {
  for (const [title, response, status] of [
    ["Server Error", { status: 500, body: "<html>Error</html>" }, 502],
    ["Invalid JSON", { body: "not json" }, 502],
    ["Invalid Shape", { resultCount: 0 }, 502],
    ["Rate Limit", { status: 429 }, 429],
  ]) {
    responses.set(`The Beatles ${title}`, response);
    const result = await search(title);
    assert.equal(result.status, status);
    assert.match((await result.json()).message, /iTunes/);
    if (status === 429) assert.equal(result.headers.get("Retry-After"), "60");
  }
  responses.set("The Beatles Server Error", { results: [song("Server Error")] });
  assert.ok((await (await search("Server Error")).json()).preview);
});

test("Cyrillic searches start in RU without spending a request on US when a match is found", async () => {
  responses.set("RU:Король И Шут Лесник", { results: [
    song("Лесник", { artistName: "Король и Шут" }),
  ] });
  const count = requests.length;
  const response = await search("Лесник", { artist: "Король И Шут" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview.artist, "Король и Шут");
  assert.equal(requests.length, count + 1);
  assert.equal(requests.at(-1).searchParams.get("country"), "RU");
});

test("an empty RU search falls back to US and matches a transliterated performer", async () => {
  responses.set("US:Леонид Агутин На сиреневой луне", { results: [
    song("На сиреневой луне", { artistName: "Leonid Agutin" }),
  ] });
  const count = requests.length;
  const response = await search("На сиреневой луне", { artist: "Леонид Агутин" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview.artist, "Leonid Agutin");
  assert.deepEqual(requests.slice(count).map((url) => url.searchParams.get("country")), ["RU", "US"]);
});

test("duration reaches the matcher and is included in the negative cache key", async () => {
  responses.set("Nautilus Pompilius Скованные", { results: [
    song("Скованные одной цепью", { artistName: "Наутилус Помпилиус", collectionName: "Князь тишины", trackTimeMillis: 263000 }),
  ] });
  const details = { artist: "Nautilus Pompilius", album: "Князь Тишины" };
  assert.deepEqual(await (await search("Скованные", details)).json(), { preview: null });
  const response = await search("Скованные", { ...details, duration: "4:23" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview.title, "Скованные одной цепью");
});

test("a hanging iTunes connection times out without blocking the API indefinitely", { timeout: 12000 }, async () => {
  responses.set("The Beatles Timeout", { hang: true });
  const result = await search("Timeout");
  assert.equal(result.status, 504);
  assert.match((await result.json()).message, /не ответил вовремя/);
});

test("local request budget prevents sending more than 20 searches per minute to iTunes", async () => {
  let limited = false;
  for (let index = 0; index < 21; index += 1) {
    const count = requests.length;
    const response = await search(`Budget ${index}`);
    if (response.status === 429) {
      assert.equal(requests.length, count);
      assert.ok(Number(response.headers.get("Retry-After")) > 0);
      limited = true;
      break;
    }
    assert.equal(response.status, 200);
  }
  assert.ok(limited);
  assert.equal(requests.length, 20);
});

test("a missing preview is looked up again after one minute", async (t) => {
  let now = Date.now() + 61000;
  t.mock.method(Date, "now", () => now);
  assert.deepEqual(await (await search("Missing For Now")).json(), { preview: null });
  const count = requests.length;
  responses.set("The Beatles Missing For Now", { results: [song("Missing For Now")] });
  now += 59000;
  assert.deepEqual(await (await search("Missing For Now")).json(), { preview: null });
  assert.equal(requests.length, count);
  now += 2000;
  assert.ok((await (await search("Missing For Now")).json()).preview);
  assert.equal(requests.length, count + 1);
});

test("compilation search mode has its own cache entry and never puts the album in the search term", async () => {
  const details = { artist: "Nautilus Pompilius", album: "Неофициальный сборник", duration: "4:23" };
  assert.deepEqual(await (await search("Скованные", details)).json(), { preview: null });
  const response = await search("Скованные", { ...details, ignore_album: "true" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview.title, "Скованные одной цепью");
  assert.equal(requests.at(-1).searchParams.get("term"), "Nautilus Pompilius Скованные");
  const count = requests.length;
  const cached = await search("Скованные", { ...details, album: "Другой сборник", ignore_album: "true" });
  assert.ok((await cached.json()).preview);
  assert.equal(requests.length, count);
});

test("repeated performer names are removed from the upstream search term", async () => {
  responses.set("Linkin Park Numb", { results: [song("Numb", { artistName: "Linkin Park" })] });
  const response = await search("Numb", { artist: "Linkin Park, Linkin Park", album: "Unofficial Hits", ignore_album: "true" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).preview.artist, "Linkin Park");
  assert.equal(requests.at(-1).searchParams.get("term"), "Linkin Park Numb");
});
