import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { App } from "./app.js";

bootstrap(App, { renderer: dom(), target: "#app" });
