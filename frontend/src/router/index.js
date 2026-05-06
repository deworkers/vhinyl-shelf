import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import SearchView from "../views/SearchView.vue";
import ReleaseView from "../views/ReleaseView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/search", name: "search", component: SearchView },
    { path: "/release/:id", name: "release", component: ReleaseView, props: true },
  ],
});

export default router;
