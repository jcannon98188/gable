import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { PricingCard } from "./pricing-card.js";

bootstrap(PricingCard, { renderer: dom(), target: "#app" });
