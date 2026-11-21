import { bootstrap } from "@gablejs/core";
import { dom } from "@gablejs/renderer-dom";
import { TodoBoard } from "./todo-board.js";

bootstrap(TodoBoard, { renderer: dom(), target: "#app" });
