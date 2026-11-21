import type { Route } from "@gablejs/core/router";
import { AboutPage } from "./pages/about.js";

export const routes: Route[] = [
  { path: "", redirectTo: "/about" },
  { path: "about", component: AboutPage, title: "About" },
];
