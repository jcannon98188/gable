import type { ComponentScenes } from "@gable/core/tooling";
import { PricingCard } from "./pricing-card.js";

export default {
  component: PricingCard,
  scenes: {
    Starter: { description: "The default plan" },
    Pro: { description: "A longer plan", inputs: { name: "Pro", price: "$29", perks: ["Unlimited projects", "Priority support", "Audit log", "Single sign-on"] } },
  },
} satisfies ComponentScenes<PricingCard>;
