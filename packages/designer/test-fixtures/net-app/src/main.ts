import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { NetApp } from "./net-app.js";

bootstrap(NetApp, { renderer: dom(), target: "#app" });
