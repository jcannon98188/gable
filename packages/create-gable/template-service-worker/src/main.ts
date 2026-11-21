import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { provideServiceWorker } from "@gablejs/service-worker";
import "./global.css";
import { Root } from "./root.js";

bootstrap(Root, {
  renderer: dom(),
  target: "#app",
  providers: provideServiceWorker({ url: "/sw.js" }),
});
