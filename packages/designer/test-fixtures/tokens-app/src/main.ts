import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import "./styles.css";
import { TokensApp } from "./tokens-app.js";

bootstrap(TokensApp, { renderer: dom(), target: "#app" });
