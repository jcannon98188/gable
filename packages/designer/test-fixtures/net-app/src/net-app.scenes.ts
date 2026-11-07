import type { ComponentScenes } from "@gable/core/tooling";
import { NetApp } from "./net-app.js";

export default {
  component: NetApp,
  scenes: {
    Live: { description: "The fixture's real dev API" },
  },
} satisfies ComponentScenes<NetApp>;
