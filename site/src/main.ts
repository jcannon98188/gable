import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./site.css";
import { SiteRoot } from "./root.js";

bootstrap(SiteRoot, { renderer: dom(), target: "#app" });
