import { defineStore } from "pinia";
import { apiFetch as fetch } from "../utils/api";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function parseJson(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.message || "Request failed");
  }
  return json;
}

export const useRecordsStore = defineStore("records", {
  state: () => ({
    records: [],
    selectedRecord: null,
    statusFilter: "my_collection",
    loading: false,
    searchResults: [],
    searchPagination: null,
    recordsRequest: null,
  }),
  actions: {
    async fetchRecords(userId = null) {
      const request = Symbol();
      this.recordsRequest = request;
      this.loading = true;
      try {
        const response = await fetch(
          `${API_BASE}/records?status=${encodeURIComponent(this.statusFilter)}${userId ? `&user_id=${encodeURIComponent(userId)}` : ""}`
        );
        const records = await parseJson(response);
        if (this.recordsRequest === request) this.records = records;
      } finally {
        if (this.recordsRequest === request) this.loading = false;
      }
    },
    async fetchAllRecords(userId = null) {
      const response = await fetch(`${API_BASE}/records${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`);
      return parseJson(response);
    },
    async searchDiscogs(params) {
      const url = new URL(`${API_BASE}/discogs/search`, window.location.origin);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      const response = await fetch(url);
      const data = await parseJson(response);
      this.searchResults = data.results ?? [];
      this.searchPagination = data.pagination ?? null;
      return data;
    },
    async fetchDiscogsRelease(releaseId) {
      const response = await fetch(`${API_BASE}/discogs/releases/${releaseId}`);
      return parseJson(response);
    },
    async fetchTrackPreview({ artist, title, album, duration = "", ignoreAlbum = false }, signal) {
      const params = new URLSearchParams({ artist, title, album, duration, ignore_album: String(ignoreAlbum) });
      const response = await fetch(`${API_BASE}/previews/search?${params}`, { signal });
      const data = await parseJson(response);
      return data.preview;
    },
    async addDiscogsRelease(payload, status, userId = null) {
      const response = await fetch(`${API_BASE}/records${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "discogs",
          status,
          discogsPayload: payload,
        }),
      });
      return parseJson(response);
    },
    async addManualRelease(manual, status) {
      const response = await fetch(`${API_BASE}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          status,
          manual,
        }),
      });
      return parseJson(response);
    },
    async fetchRecordById(id) {
      const response = await fetch(`${API_BASE}/records/${id}`);
      this.selectedRecord = await parseJson(response);
      return this.selectedRecord;
    },
    async updateRecord(id, payload) {
      const response = await fetch(`${API_BASE}/records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseJson(response);
    },
    async deleteRecord(id) {
      const response = await fetch(`${API_BASE}/records/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.message || "Delete failed");
      }
      return true;
    },
    async uploadCover(file, recordId = null) {
      const formData = new FormData();
      formData.append("cover", file);
      if (recordId) formData.append("record_id", String(recordId));
      const response = await fetch(`${API_BASE}/uploads/cover`, {
        method: "POST",
        body: formData,
      });
      return parseJson(response);
    },
  },
});
