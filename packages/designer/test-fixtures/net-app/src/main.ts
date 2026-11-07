import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { NetApp } from "./net-app.js";

bootstrap(NetApp, { renderer: dom(), target: "#app" });
