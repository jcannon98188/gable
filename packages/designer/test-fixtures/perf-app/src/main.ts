import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { PerfApp } from "./perf-app.js";

bootstrap(PerfApp, { renderer: dom(), target: "#app" });
