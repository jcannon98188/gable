// MCP tools for refactors from the canvas (TASK-56.24): find every use of a component or a CSS class, and rename a component
// across the project. Both read the project's files; the rename is the `renameComponent` op of the edit service, so it is the
// same minimal patches on the same undo history as every other edit (several files, one undo step).
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { EditService } from "../edit/service.js";
import type { EditResult } from "../edit/types.js";

type Annotations = { title: string; description: string; annotations: Record<string, boolean> };

export interface RefactorToolDeps {
  edits(): EditService;
  /** control.ts's commit: applies the edit, tells the shell the history changed and returns the diff. */
  commit(result: () => EditResult, file: string | null): Promise<unknown>;
  read(name: string, description: string): Annotations;
  write(name: string, description: string, idempotent?: boolean): Annotations;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
}

export function registerRefactorTools(server: McpServer, deps: RefactorToolDeps): void {
  server.registerTool(
    "find_uses",
    {
      ...deps.read(
        "Find uses",
        "Every use of a component (kind component: its declaration, imports, re-exports, `imports` lists, other code references, and the templates that use its selector) or of a CSS class (kind class: template class attributes, [class.x] bindings, component host bindings and stylesheet rules), each with file, line, column and the line's text. A use in a template (an element) has `select.target` to pass to select_element. Read before rename_component to see what it will touch.",
      ),
      inputSchema: {
        kind: z.enum(["component", "class"]),
        name: z.string().describe("The component's exported class (TodoItem), or the CSS class (completed)."),
        file: z.string().optional().describe("A component only: its module (src/todo-item.ts), when two files declare a class with that name."),
      },
    },
    deps.guard(async ({ kind, name, file }: { kind: "component" | "class"; name: string; file?: string }) => {
      const r = deps.edits().findUses(kind === "component" ? { kind, name, ...(file ? { file } : {}) } : { kind, name });
      if (!r.ok) throw new Error(`${r.code}: ${r.error}`);
      return {
        kind: r.kind,
        name: r.name,
        ...(r.declaration ? { declaration: r.declaration } : {}),
        count: r.uses.length,
        uses: r.uses.map(({ raw, offset, ...u }) => ({ ...u, ...(raw !== undefined ? { select: { target: { file: u.file, line: u.line, column: u.column } } } : {}) })),
      };
    }),
  );

  server.registerTool(
    "rename_component",
    {
      ...deps.write(
        "Rename a component",
        "Renames a component class in every file that declares, imports or re-exports it (identifiers only; strings and comments are left, and counted in `note`), as minimal patches in one undo step: `undo` restores every file. With `selector`, also renames its selector in its meta, in every template that uses it and in stylesheets that style the tag (a tag or a tag with one attribute, same shape as before). The file keeps its name. Run find_uses first to see what it touches. Refused when the new name is taken.",
      ),
      inputSchema: {
        from: z.string().describe("The exported class to rename, e.g. TodoItem."),
        to: z.string().describe("The new name, e.g. TodoRow."),
        file: z.string().optional().describe("The class's module (src/todo-item.ts), when two files declare a class with that name."),
        selector: z.string().optional().describe("Also rename the selector to this, e.g. app-todo-row or li[app-todo-row]."),
      },
    },
    deps.guard(async ({ from, to, file, selector }: { from: string; to: string; file?: string; selector?: string }) =>
      deps.commit(() => deps.edits().apply({ op: "renameComponent", from, to, ...(file ? { file } : {}), ...(selector ? { selector } : {}) }), file ?? null),
    ),
  );
}
