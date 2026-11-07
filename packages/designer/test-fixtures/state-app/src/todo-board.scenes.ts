import type { ComponentScenes } from "@gable/core/tooling";
import { TodoBoard } from "./todo-board.js";

export default {
  component: TodoBoard,
  scenes: {
    Empty: { description: "Nothing to do" },
    Titled: {
      description: "A named board",
      inputs: { title: "Groceries" },
    },
  },
} satisfies ComponentScenes<TodoBoard>;
