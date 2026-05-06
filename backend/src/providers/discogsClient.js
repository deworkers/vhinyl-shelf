const DISCOGS_API_BASE = "https://api.discogs.com";

function createHeaders() {
  const token = process.env.DISCOGS_TOKEN;
  const userAgent =
    process.env.DISCOGS_USER_AGENT || "VinylShelf/1.0 +https://localhost";

  const headers = {
    Accept: "application/vnd.discogs.v2.discogs+json",
    "User-Agent": userAgent,
  };

  if (token) {
    headers.Authorization = `Discogs token=${token}`;
  }

  return headers;
}

async function discogsFetch(endpoint, searchParams = {}) {
  const url = new URL(`${DISCOGS_API_BASE}${endpoint}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: createHeaders(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Discogs request failed");
    error.status = response.status;
    error.details = data;
    error.rateLimit = {
      total: response.headers.get("X-Discogs-Ratelimit"),
      used: response.headers.get("X-Discogs-Ratelimit-Used"),
      remaining: response.headers.get("X-Discogs-Ratelimit-Remaining"),
    };
    throw error;
  }

  return {
    data,
    rateLimit: {
      total: response.headers.get("X-Discogs-Ratelimit"),
      used: response.headers.get("X-Discogs-Ratelimit-Used"),
      remaining: response.headers.get("X-Discogs-Ratelimit-Remaining"),
    },
  };
}

function resolveCoverUrl(release) {
  if (Array.isArray(release?.images)) {
    const primary = release.images.find((image) => image.type === "primary");
    if (primary?.uri) return primary.uri;
  }
  if (release?.thumb) return release.thumb;
  return null;
}

export { discogsFetch, resolveCoverUrl };
