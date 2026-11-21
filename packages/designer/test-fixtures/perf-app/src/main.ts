import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { PerfApp } from "./perf-app.js";

bootstrap(PerfApp, { renderer: dom(), target: "#app" });
