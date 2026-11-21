import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import "./styles.css";
import { RefactorApp } from "./refactor-app.js";

bootstrap(RefactorApp, { renderer: dom(), target: "#app" });
