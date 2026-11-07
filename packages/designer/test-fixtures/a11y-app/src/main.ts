import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { A11yApp } from "./a11y-app.js";

bootstrap(A11yApp, { renderer: dom(), target: "#app" });
