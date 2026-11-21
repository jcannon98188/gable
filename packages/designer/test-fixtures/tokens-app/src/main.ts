import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import "./styles.css";
import { TokensApp } from "./tokens-app.js";

bootstrap(TokensApp, { renderer: dom(), target: "#app" });
