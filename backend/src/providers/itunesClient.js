const cache = new Map();
const requestTimes = [];
const CACHE_TTL = 60 * 60 * 1000;
const MISSING_PREVIEW_TTL = 60 * 1000;
const MAX_CACHE_SIZE = 200;
const transliteration = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
const alternativeTransliteration = { ё: "e", й: "i", х: "h", ц: "c", щ: "sch", ю: "iu", я: "ia" };

function normalize(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .replace(/\s+/g, " ");
}

function cleanArtist(value) {
  const name = value.replace(/\s+\(\d+\)(?=,|$)/g, "").trim();
  const parts = name.split(/\s*,\s*/);
  return parts.every((part) => normalize(part) === normalize(parts[0])) ? parts[0] : name;
}

function normalizeArtist(value) {
  return normalize(cleanArtist(value)).replace(/^the | the$/g, "");
}

function artistNames(value) {
  const name = cleanArtist(value).toLowerCase();
  return new Set([
    normalizeArtist(name),
    normalizeArtist(name.replace(/[а-яё]/g, (letter) => transliteration[letter])),
    normalizeArtist(name.replace(/[а-яё]/g, (letter) => alternativeTransliteration[letter] ?? transliteration[letter])),
  ]);
}

function normalizeTitle(value) {
  return normalize(value
    .replace(/\s*[\[(](?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?[\])]/gi, "")
    .replace(/\s*[-–—]\s*(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?$/i, ""));
}

function durationMillis(value = "") {
  if (!/^(?:\d{1,3}:[0-5]\d|\d{1,2}:[0-5]\d:[0-5]\d)$/.test(value)) return 0;
  const parts = value.split(":").map(Number);
  if (parts.length === 3 && parts[1] >= 60) return 0;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0) * 1000;
}

function httpsUrl(value, hostPattern) {
  try {
    const url = new URL(value);
    if (!hostPattern.test(url.hostname) || !["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

export function selectPreview(results, { artist, title, album = "", duration = "", ignoreAlbum = false }) {
  const names = artistNames(artist);
  const queryTitle = normalizeTitle(title);
  const queryAlbum = ignoreAlbum ? "" : normalizeTitle(album);
  const queryDuration = durationMillis(duration);
  const matches = results.filter((track) =>
    track?.kind === "song" && typeof track.artistName === "string" &&
    typeof track.trackName === "string" &&
    [...artistNames(track.artistName)].some((name) => names.has(name))
  ).map((track) => ({
    trackId: track.trackId,
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName || "",
    previewUrl: httpsUrl(track.previewUrl, /(^|\.)itunes\.apple\.com$/i),
    trackViewUrl: httpsUrl(track.trackViewUrl, /^(?:music|itunes)\.apple\.com$/i),
    duration: track.trackTimeMillis,
  })).filter((track) => track.previewUrl && track.trackViewUrl);

  const exact = matches.filter((track) => normalizeTitle(track.title) === queryTitle);
  let match = exact.find((track) => queryAlbum && normalizeTitle(track.album) === queryAlbum) || exact[0];
  if (!match && queryTitle.length >= 8 && (queryAlbum || ignoreAlbum) && queryDuration) {
    const shortened = matches.filter((track) => {
      const candidateTitle = normalizeTitle(track.title);
      const extension = candidateTitle.slice(queryTitle.length).trim();
      const differentVersion = /(^| )(live|concert|remix(?:ed)?|mix|edit|version|acoustic|instrumental|demo|cover|karaoke|alternate|session|re recorded)( |$)|концерт|ремикс|акуст|инструмент|демо|кавер|верси|перезапис/.test(extension);
      return candidateTitle.startsWith(`${queryTitle} `) && !differentVersion &&
        (ignoreAlbum || normalizeTitle(track.album) === queryAlbum) && Number.isFinite(track.duration) &&
        Math.abs(track.duration - queryDuration) <= Math.max(10000, queryDuration * 0.03);
    });
    if (new Set(shortened.map((track) => normalizeTitle(track.title))).size === 1) match = shortened[0];
  }

  if (!match) return null;
  const { duration: _duration, ...preview } = match;
  return preview;
}

function requestError(message, status, retryAfter) {
  return Object.assign(new Error(message), { status, retryAfter });
}

async function searchCountry(query, country, signal) {
  const now = Date.now();
  while (requestTimes.length && requestTimes[0] <= now - 60000) requestTimes.shift();
  if (requestTimes.length >= 20) {
    throw requestError("Слишком много запросов к iTunes. Попробуйте через минуту.", 429,
      Math.ceil((requestTimes[0] + 60000 - now) / 1000));
  }
  requestTimes.push(now);

  const baseUrl = process.env.ITUNES_API_BASE || "https://itunes.apple.com";
  const url = new URL("search", `${baseUrl.replace(/\/$/, "")}/`);
  url.search = new URLSearchParams({
    term: `${cleanArtist(query.artist)} ${query.title}`,
    media: "music",
    entity: "song",
    country,
    limit: "50",
  }).toString();

  try {
    const response = await fetch(url, { signal });
    if (response.status === 429) {
      throw requestError("iTunes временно ограничил запросы. Попробуйте через минуту.", 429, 60);
    }
    if (!response.ok) throw requestError("Не удалось выполнить поиск в iTunes. Попробуйте ещё раз.", 502);
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error("Invalid iTunes response");
    return selectPreview(data.results, query);
  } catch (error) {
    if (error.status) throw error;
    if (error.name === "TimeoutError") {
      throw requestError("iTunes не ответил вовремя. Попробуйте ещё раз.", 504);
    }
    throw requestError("Не удалось связаться с iTunes. Попробуйте ещё раз.", 502);
  }
}

async function searchPreview(query) {
  const countries = /\p{Script=Cyrillic}/u.test(`${query.artist} ${query.title}`) ? ["RU", "US"] : ["US"];
  const signal = AbortSignal.timeout(8000);
  for (const country of countries) {
    const preview = await searchCountry(query, country, signal);
    if (preview) return preview;
  }
  return null;
}

export async function findTrackPreview(query) {
  const key = JSON.stringify([
    normalizeArtist(query.artist), normalizeTitle(query.title),
    query.ignoreAlbum ? "" : normalizeTitle(query.album), durationMillis(query.duration), Boolean(query.ignoreAlbum),
  ]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  if (cache.size >= MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
  const entry = { expiresAt: Date.now() + CACHE_TTL, result: searchPreview(query) };
  cache.set(key, entry);
  try {
    const preview = await entry.result;
    entry.expiresAt = Date.now() + (preview ? CACHE_TTL : MISSING_PREVIEW_TTL);
    return preview;
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  }
}
