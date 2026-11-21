import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import "./global.css";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
