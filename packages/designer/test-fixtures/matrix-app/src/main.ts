import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { PricingCard } from "./pricing-card.js";

bootstrap(PricingCard, { renderer: dom(), target: "#app" });
