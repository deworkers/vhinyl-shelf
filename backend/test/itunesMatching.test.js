import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPreview } from "../src/providers/itunesClient.js";

const query = {
  artist: "Nautilus Pompilius", title: "Скованные", album: "Князь Тишины", duration: "4:23",
};
const song = (extra = {}) => ({
  kind: "song", trackId: 1, artistName: "Наутилус Помпилиус",
  trackName: "Скованные одной цепью", collectionName: "Князь тишины", trackTimeMillis: 263000,
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  trackViewUrl: "https://music.apple.com/ru/album/song/123?i=1",
  ...extra,
});

test("Cyrillic and transliterated artist names match without accepting another performer", () => {
  for (const [artist, candidate] of [
    ["Король И Шут (2)", "Korol I Shut"],
    ["Леонид Агутин", "Leonid Agutin"],
    ["Валерий Меладзе", "Valeriy Meladze"],
    ["Чайф", "Chaif"],
    ["Пётр", "Petr"],
  ]) {
    const result = selectPreview([
      song({ trackName: "Песня", artistName: "Cover Band", trackId: 2 }),
      song({ trackName: "Песня", artistName: candidate }),
    ], { artist, title: "Песня" });
    assert.equal(result?.trackId, 1, `${artist} / ${candidate}`);
    assert.equal(result.artist, candidate);
  }
});

test("a shortened title matches an unambiguous song on the same album with a close duration", () => {
  const result = selectPreview([song({ trackTimeMillis: 267000 })], query);
  assert.equal(result?.title, "Скованные одной цепью");
  assert.equal(result.artist, "Наутилус Помпилиус");
  assert.equal(Object.hasOwn(result, "duration"), false);
});

test("a shortened title needs both matching album and duration", () => {
  for (const changed of [{ album: "" }, { album: "Другой альбом" }, { duration: "" }, { duration: "2:00" }]) {
    assert.equal(selectPreview([song()], { ...query, ...changed }), null);
  }
  for (const changed of [{ artistName: "Cover Band" }, { trackTimeMillis: undefined }, { trackTimeMillis: "263000" }]) {
    assert.equal(selectPreview([song(changed)], query), null);
  }
});

test("ambiguous shortened titles and partial words are rejected", () => {
  assert.equal(selectPreview([song(), song({ trackId: 2, trackName: "Скованные навеки" })], query), null);
  assert.equal(selectPreview([song()], { ...query, title: "Скованны" }), null);
});

test("an exact title takes precedence over a shortened match and does not need duration", () => {
  const exact = song({ trackId: 2, trackName: "Скованные", collectionName: "Другой альбом" });
  assert.equal(selectPreview([song(), exact], query)?.trackId, 2);
  assert.ok(selectPreview([exact], { ...query, duration: "" }));
});

test("shortened titles do not select live, remix, acoustic, cover or re-recorded versions", () => {
  for (const version of ["Live", "In Concert", "Club Remix", "Remixed", "Acoustic", "Instrumental",
    "Demo", "Cover", "Re-Recorded 1981", "Концерт", "Ремикс", "Акустическая версия", "Перезапись"]) {
    assert.equal(selectPreview([song({ trackName: `Скованные (${version})` })], query), null, version);
  }
});

test("an exact title cannot be replaced by a live version with a translated artist name", () => {
  assert.equal(selectPreview([
    song({ artistName: "Korol I Shut", trackName: "Лесник (Live)" }),
  ], { artist: "Король И Шут", title: "Лесник" }), null);
});

test("compilation mode ignores the album for shortened titles while still requiring duration", () => {
  const compilation = { ...query, album: "Неофициальный сборник", ignoreAlbum: true };
  assert.equal(selectPreview([song()], compilation)?.title, "Скованные одной цепью");
  assert.equal(selectPreview([song()], { ...compilation, duration: "" }), null);
  assert.equal(selectPreview([song()], { ...compilation, duration: "2:00" }), null);
  assert.equal(selectPreview([song()], { ...compilation, ignoreAlbum: false }), null);
});

test("compilation mode does not prefer the collection's album name over another matching song", () => {
  const candidates = [
    song({ trackName: "Скованные", collectionName: "Оригинальный альбом", trackId: 1 }),
    song({ trackName: "Скованные", trackId: 2 }),
  ];
  assert.equal(selectPreview(candidates, query)?.trackId, 2);
  assert.equal(selectPreview(candidates, { ...query, ignoreAlbum: true })?.trackId, 1);
});

test("compilation mode rejects ambiguous shortened titles, covers and alternate versions", () => {
  const compilation = { ...query, album: "Сборник", ignoreAlbum: true };
  assert.equal(selectPreview([
    song(), song({ trackName: "Скованные навеки", collectionName: "Другой альбом" }),
  ], compilation), null);
  for (const candidate of [
    song({ artistName: "Cover Band" }),
    song({ trackName: "Скованные (Live)" }),
    song({ trackName: "Скованные (Club Remix)" }),
  ]) assert.equal(selectPreview([candidate], compilation), null);
});

test("a repeated performer name is collapsed without reducing a collaboration to its first artist", () => {
  for (const artist of ["Linkin Park", "Backstreet Boys"]) {
    assert.ok(selectPreview([song({ artistName: artist, trackName: "Song" })], {
      artist: `${artist}, ${artist}`, title: "Song", ignoreAlbum: true,
    }));
  }
  assert.equal(selectPreview([song({ artistName: "Queen", trackName: "Song" })], {
    artist: "Queen, David Bowie", title: "Song", ignoreAlbum: true,
  }), null);
});
