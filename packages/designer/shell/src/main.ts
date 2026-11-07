import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./shell.css";
import { Shell } from "./app/shell.js";

bootstrap(Shell, { renderer: dom(), target: "#app" });
