const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("X-Requested-With", "VinylShelf");
  const response = await globalThis.fetch(url, { ...options, headers, credentials: "include" });
  if (response.status === 401 && !/\/auth\/(login|register|me)(?:\?|$)/.test(String(url))) {
    window.location.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
  return response;
}

export async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await apiFetch(`${API_BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || "Не удалось выполнить запрос.");
    error.status = response.status;
    throw error;
  }
  return data;
}
