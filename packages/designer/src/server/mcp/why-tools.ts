// MCP tools for "why did this update" (TASK-56.19): for the selected element (or a component, signal or effect by id) what its
// bindings depend on and which signal writes caused their last runs, and the canvas's "Highlight updates". Both go through the
// shell (the Why tab's service), so the drawer shows what the agent asked. The causes are the devtools hook's own record.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ControlCommands } from "../../control-protocol.js";
import { summarizeWhy } from "../../why.js";

type Annotated = { title: string; description: string; annotations: Record<string, boolean> };

export interface WhyToolKit {
  shell<N extends keyof ControlCommands>(name: N, params: ControlCommands[N]["params"], timeoutMs?: number): Promise<ControlCommands[N]["result"]>;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
  fail(message: string): never;
  read(name: string, description: string): Annotated;
  write(name: string, description: string, idempotent?: boolean): Annotated;
}

export function registerWhyTools(server: McpServer, kit: WhyToolKit): void {
  const { shell, guard, fail, read, write } = kit;

  server.registerTool(
    "why_did_update",
    {
      ...read(
        "Why did this update",
        "The Why tab: for the selected element (select_element), each of its dynamic bindings with the signals it depends on (through computeds) and, for its recent runs, which signal writes caused them (the signal, its value before and after, the computeds between, and whether the app or the Designer wrote it). `scope: component` lists every effect of the element's component instead; `id` explains one component, signal or effect id from get_signals. Causes are recorded while the Designer is connected: a run no write explains says so. Field bindings and @if/@for blocks appear only at component scope.",
      ),
      inputSchema: {
        scope: z.enum(["element", "component"]).default("element").describe("The selected element's bindings, or all effects of its component."),
        id: z.string().optional().describe("A component, signal or effect id to explain instead of the selection."),
        runs: z.number().int().min(1).max(5).default(3).describe("How many recent runs of each binding to include."),
      },
    },
    guard(async ({ scope, id, runs }) => {
      const r = await shell("why", { scope, ...(id ? { id } : {}) });
      const s = r.shown;
      if (!s) return fail(r.empty || "Nothing to explain: select an element first (select_element).");
      return {
        scope: s.scope,
        title: s.title,
        component: s.component?.name ?? null,
        bindings: summarizeWhy({ nodes: s.nodes }, runs),
        ...(s.elsewhere ? { elsewhere: s.elsewhere } : {}),
      };
    }),
  );

  server.registerTool(
    "highlight_updates",
    {
      ...write("Highlight updates", "Turns on (`on: true`) or off the canvas outline that flashes the elements whose bindings re-run, so a person watching sees what updates when the app changes.", true),
      inputSchema: { on: z.boolean() },
    },
    guard(async ({ on }) => {
      const r = await shell("highlightUpdates", { on });
      if (r.error) fail(r.error);
      return { on: r.on };
    }),
  );
}
