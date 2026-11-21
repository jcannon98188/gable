import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { FocusApp } from "./focus-app.js";

bootstrap(FocusApp, { renderer: dom(), target: "#app" });
