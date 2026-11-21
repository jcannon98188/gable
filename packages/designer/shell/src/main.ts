import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import "./shell.css";
import "./app/icons.js";
import { Shell } from "./app/shell.js";

bootstrap(Shell, { renderer: dom(), target: "#app" });
