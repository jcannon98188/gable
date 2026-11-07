import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { FocusApp } from "./focus-app.js";

bootstrap(FocusApp, { renderer: dom(), target: "#app" });
