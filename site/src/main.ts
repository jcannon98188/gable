import { bootstrap } from "@gablejs/core";
import { provideRouter } from "@gablejs/core/router";
import { dom } from "@gablejs/renderer-dom";
import "./site.css";
import { App } from "./app.js";
import { BASE } from "./docs/base.js";
import { routes } from "./routes.js";

// Path-mode routing under the deploy base (`/gable` on GitHub Pages). Pages serves 404.html for any URL it does not
// know, and CI makes that file a copy of index.html, so a deep link or refresh boots the app at that URL.
bootstrap(App, { renderer: dom({ base: BASE }), providers: provideRouter(routes), target: "#app" });
