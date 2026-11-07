import { bootstrap } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import { TodoBoard } from "./todo-board.js";

bootstrap(TodoBoard, { renderer: dom(), target: "#app" });
