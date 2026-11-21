import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { A11yApp } from "./a11y-app.js";

bootstrap(A11yApp, { renderer: dom(), target: "#app" });
