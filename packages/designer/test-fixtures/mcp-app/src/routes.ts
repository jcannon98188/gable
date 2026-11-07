import type { Route } from "@gable/core/router";
import { AboutPage } from "./pages/about.js";

export const routes: Route[] = [
  { path: "", redirectTo: "/about" },
  { path: "about", component: AboutPage, title: "About" },
];
