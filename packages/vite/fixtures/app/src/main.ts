import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { App } from "./app.js";

bootstrap(App, { renderer: dom(), target: "#app" });
