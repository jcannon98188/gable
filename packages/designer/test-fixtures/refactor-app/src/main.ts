import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./styles.css";
import { RefactorApp } from "./refactor-app.js";

bootstrap(RefactorApp, { renderer: dom(), target: "#app" });
