// MCP tools for signal time travel (TASK-56.18): read the selected frame's recorded state history, travel the app to a past
// step and back, clear it, pause or resume recording. All of it goes through the shell (the State timeline's service), so the
// drawer shows what the agent did. The history is the devtools hook's own record of the app's writes: nothing is made up.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { HistoryInfo, HistoryStep } from "@gable/core/devtools";
import type { ControlCommands, HistoryResult } from "../../control-protocol.js";

type Annotated = { title: string; description: string; annotations: Record<string, boolean> };

export interface HistoryToolKit {
  shell<N extends keyof ControlCommands>(name: N, params: ControlCommands[N]["params"], timeoutMs?: number): Promise<ControlCommands[N]["result"]>;
  guard<A>(body: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult>;
  /** Throws an error the agent reads as the tool's answer. */
  fail(message: string): never;
  read(name: string, description: string): Annotated;
  write(name: string, description: string, idempotent?: boolean): Annotated;
}

/** A step as an agent reads it: each write as `before`/`after` previews (the same text the drawer shows). */
export function stepSummary(s: HistoryStep) {
  return {
    step: s.seq,
    atMs: Math.round(s.at),
    source: s.source,
    writes: s.writes.map((w) => ({ signal: w.id, name: w.name, owner: w.owner, before: w.before.s, after: w.after.s })),
    ...(s.more ? { more: s.more } : {}),
  };
}

/** The history, newest `limit` steps, with where the frame is. */
export function historySummary(info: HistoryInfo, limit: number) {
  const steps = info.steps.slice(-limit);
  return {
    recording: info.recording,
    shown: info.cursor === null ? "live" : info.cursor === (info.steps[0]?.seq ?? 1) - 1 ? "start" : info.cursor,
    steps: steps.map(stepSummary),
    total: info.steps.length,
    ...(steps.length < info.steps.length ? { omitted: info.steps.length - steps.length } : {}),
    ...(info.dropped ? { dropped: info.dropped } : {}),
    bounds: { steps: info.maxSteps, writes: info.maxWrites },
  };
}

export function registerHistoryTools(server: McpServer, kit: HistoryToolKit): void {
  const { shell, guard, fail, read, write } = kit;

  server.registerTool(
    "get_signal_history",
    {
      ...read(
        "Get signal history",
        "The selected frame's state history (the drawer's State timeline): each recorded step (one task's writes to the app's signals, its effects' answers included) with every signal's value before and after, oldest first, and which state the frame shows (`live`, `start` or a step number). The Designer turns recording on when a frame connects and keeps the last 300 steps and 2000 writes.",
      ),
      inputSchema: { limit: z.number().int().min(1).max(300).default(30).describe("How many of the newest steps to return.") },
    },
    guard(async ({ limit }) => historySummary((await shell("history", { action: "report" })).info, limit)),
  );

  server.registerTool(
    "travel_signal_history",
    {
      ...write(
        "Travel signal history",
        "Puts the app in the selected frame back to a recorded state: just after step `to`, `start` (before the first recorded step) or `live` (the newest). Each recorded signal gets its value from then and the view updates; what the app derives in answer is not recorded. Signals of components destroyed since are left out (counted in `gone`). A new write by the app (or set_signal) goes on from the travelled-to state.",
        true,
      ),
      inputSchema: { to: z.union([z.number().int(), z.enum(["start", "live"])]).describe("A step number from get_signal_history, `start` or `live`.") },
    },
    guard(async ({ to }) => {
      const r: HistoryResult = await shell("history", { action: "travel", to });
      if (!r.travel?.ok) fail(r.travel?.error ?? "The frame did not travel.");
      const t = r.travel as Extract<NonNullable<HistoryResult["travel"]>, { ok: true }>;
      const notes = [
        ...(t.gone ? [`${t.gone} signal(s) of that state no longer exist (a destroyed component's, or rebuilt by a hot update) and were left out.`] : []),
        ...(t.incomplete ? ["A step held more writes than are kept, so the state is only partly restored."] : []),
      ];
      return { ok: true, shown: historySummary(r.info, 1).shown, applied: t.applied, gone: t.gone, ...(notes.length ? { notes } : {}) };
    }),
  );

  server.registerTool(
    "clear_signal_history",
    write("Clear signal history", "Forgets the selected frame's recorded state history. The app keeps its current state; recording goes on.", true),
    guard(async () => historySummary((await shell("history", { action: "clear" })).info, 1)),
  );

  server.registerTool(
    "record_signal_history",
    {
      ...write("Record signal history", "Pauses (`on: false`) or resumes recording of the selected frame's state history. The recorded steps are kept.", true),
      inputSchema: { on: z.boolean() },
    },
    guard(async ({ on }) => {
      const { info } = await shell("history", { action: "record", on });
      return { recording: info.recording, total: info.steps.length };
    }),
  );
}
