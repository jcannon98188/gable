import { lazy } from "@gable/core";
import type { Route } from "@gable/core/router";
import { SiteRoot } from "./root.js";

/** The marketing page at `/`, the docs under `/docs`. Unknown URLs go home. */
export const routes: Route[] = [
  { path: "", component: SiteRoot, title: "Gable: Angular's best ideas, real hot reload, no compiler" },
  { path: "docs", children: lazy(() => import("./docs/routes.js"), "docsRoutes") },
  { path: "**", redirectTo: "/" },
];
