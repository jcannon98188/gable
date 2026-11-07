import type { ComponentScenes } from "@gable/core/tooling";
import { ProfileCard } from "./card.js";

export default {
  component: ProfileCard,
  scenes: {
    Default: { description: "A card nobody follows yet" },
    Followed: { description: "After clicking Follow", url: "/about" },
  },
} satisfies ComponentScenes<ProfileCard>;
