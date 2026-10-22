import { defineStore } from "pinia";
import { apiRequest } from "../utils/api";

export const useAuthStore = defineStore("auth", {
  state: () => ({ user: null, initialized: false }),
  getters: {
    isAdmin: (state) => state.user?.role === "admin",
  },
  actions: {
    async initialize() {
      if (this.initialized) return;
      try {
        const data = await apiRequest("/auth/me");
        this.user = data.user;
      } catch (error) {
        if (error.status !== 401) throw error;
        this.user = null;
      }
      this.initialized = true;
    },
    async authenticate(mode, username, password) {
      const data = await apiRequest(`/auth/${mode}`, { method: "POST", body: { username, password } });
      this.user = data.user;
      this.initialized = true;
    },
    async logout() {
      await apiRequest("/auth/logout", { method: "POST" });
      this.user = null;
    },
  },
});
