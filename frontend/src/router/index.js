import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import SearchView from "../views/SearchView.vue";
import ReleaseView from "../views/ReleaseView.vue";
import LoginView from "../views/LoginView.vue";
import AccountView from "../views/AccountView.vue";
import AdminView from "../views/AdminView.vue";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { public: true } },
    { path: "/account", name: "account", component: AccountView },
    { path: "/admin", name: "admin", component: AdminView, meta: { admin: true } },
    { path: "/", name: "home", component: HomeView },
    { path: "/search", name: "search", component: SearchView },
    { path: "/release/:id", name: "release", component: ReleaseView, props: true },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  try {
    await auth.initialize();
  } catch {
    if (to.name === "login") return true;
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (!to.meta.public && !auth.user) return { name: "login", query: { redirect: to.fullPath } };
  if (to.meta.admin && !auth.isAdmin) return { name: "home" };
  if (to.name === "login" && auth.user) return { name: "home" };
});

export default router;
