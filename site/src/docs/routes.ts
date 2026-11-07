import "./docs.css";
import type { Route } from "@gable/core/router";
import { ApiIndexPage, ApiSymbolPage, DocsHome, DocsNotFound, GuidePage, PackagePage } from "./pages.js";
import { DocsShell } from "./shell.js";

/**
 * The /docs routes (loaded lazily from the site routes, so the marketing page does not pay for the docs code).
 *   /docs                          home
 *   /docs/guides/:slug             a markdown guide from docs/
 *   /docs/:pkg                     a package overview
 *   /docs/:pkg/api                 its reference index
 *   /docs/:pkg/api/:sym            one symbol (the extractor's id, URL-encoded)
 */
export const docsRoutes: Route[] = [
  {
    path: "",
    component: DocsShell,
    children: [
      { path: "", component: DocsHome },
      { path: "guides/:slug", component: GuidePage },
      { path: ":pkg", component: PackagePage },
      { path: ":pkg/api", component: ApiIndexPage },
      { path: ":pkg/api/:sym", component: ApiSymbolPage },
      { path: "**", component: DocsNotFound },
    ],
  },
];
