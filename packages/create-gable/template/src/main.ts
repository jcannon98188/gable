import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./global.css";
import { Root } from "./root.js";

bootstrap(Root, { renderer: dom(), target: "#app" });
