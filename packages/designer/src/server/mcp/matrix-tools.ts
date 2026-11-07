// The MCP tools behind the Matrix tab (TASK-56.22): render every Scenario at several widths, look at the grid, save the
// pictures as baselines, and see what changed against them. They go through the shell, so the drawer's Matrix tab shows
// what an agent asks for. The renders are real (a headless browser loading the project's dev server); nothing is written
// to the project, and baselines live in the Designer's data directory.
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { cellId, type CellKey, type MatrixCell, type MatrixCommandResult, type MatrixRun } from "../../matrix.js";
import type { NetworkToolKit } from "./network-tools.js";

export type MatrixToolKit = Pick<NetworkToolKit, "server" | "shell" | "read" | "write" | "guard" | "fail">;

const RUN_TIMEOUT_MS = 240000;

const cellSchema = z.object({
  file: z.string().describe("The scenes file, as in get_matrix (`/src/x.scenes.ts`)."),
  scene: z.string(),
  width: z.number().int().describe("The breakpoint's width in CSS pixels."),
});

/** A cell as an agent reads it: no picture, the numbers that say what changed. */
function brief(c: MatrixCell) {
  return {
    file: c.file,
    scene: c.scene,
    width: c.width,
    status: c.status,
    ...(c.status === "changed" ? { changedPixels: c.changedPixels, changedPercent: Math.round((c.changedRatio ?? 0) * 10000) / 100, box: c.box } : {}),
    ...(c.status === "markup" ? { note: "Pixels match the baseline but the rendered markup differs." } : {}),
    ...(c.error ? { error: c.error } : {}),
    ...(c.console?.length ? { console: c.console } : {}),
    ...(c.contentHeight && c.contentHeight > c.height ? { contentHeight: c.contentHeight } : {}),
  };
}

/** The run as an agent reads it. */
export function matrixView(r: MatrixCommandResult) {
  const run: MatrixRun | null = r.run;
  if (!run) return { run: null, note: "The matrix has not been run in this Designer session. Call run_matrix." };
  return {
    ranAt: new Date(run.at).toISOString(),
    renderer: run.renderer,
    breakpoints: run.breakpoints,
    viewportHeight: run.height,
    counts: run.counts,
    scenes: run.rows.map((row) => ({ file: row.file, scene: row.scene, component: row.component, cells: run.cells.filter((c) => c.file === row.file && c.scene === row.scene).map(brief) })),
    note: run.note,
    ...(r.saved !== undefined ? { saved: r.saved } : {}),
  };
}

export function registerMatrixTools(kit: MatrixToolKit): void {
  const { server, shell, read, write, guard } = kit;
  const which = z
    .union([z.enum(["all", "changed"]), z.array(cellSchema).min(1)])
    .describe("`all` (every cell that rendered), `changed` (cells that are changed, new or differ in markup), or the cells to use.");

  server.registerTool(
    "get_matrix",
    {
      ...read("Get matrix", "The last Scenario by breakpoint matrix run: for every Scenario at every breakpoint, whether it matches its baseline (`same`), differs in pixels (`changed`, with the share of changed pixels and their bounding box), differs only in rendered markup (`markup`), has no baseline (`new`), or failed to render (`error`). Pictures are not included; see get_matrix_cell. Says so when the matrix has not been run yet."),
    },
    guard(async () => matrixView(await shell("matrix", { action: "report" }))),
  );

  server.registerTool(
    "run_matrix",
    {
      ...write("Run matrix", "Renders every Scenario (every scene of every *.scenes.ts file, or the ones named) at each breakpoint in a headless browser against the project's dev server, and compares each picture with its saved baseline. Takes a few seconds per cell. Cells are capped at 48 and breakpoints at 6. Writes nothing to the project. The Designer's Matrix tab shows the result."),
      inputSchema: {
        files: z.array(z.string()).optional().describe("Only these scenes files (`/src/x.scenes.ts`)."),
        scenes: z.array(z.string()).optional().describe("Only scenes with these names."),
        breakpoints: z.array(z.object({ name: z.string().optional(), width: z.number().int().min(200).max(4000) })).max(6).optional().describe("Columns; default phone 375, md 768, lg 1024, xl 1280."),
        height: z.number().int().min(240).max(4000).optional().describe("Viewport height of every cell (default 720)."),
      },
    },
    guard(async ({ files, scenes, breakpoints, height }) =>
      matrixView(await shell("matrix", { action: "run", request: { files, scenes, breakpoints: breakpoints?.map((b) => ({ name: b.name ?? String(b.width), width: b.width })), height } }, RUN_TIMEOUT_MS)),
    ),
  );

  server.registerTool(
    "get_matrix_cell",
    {
      ...read("Get matrix cell", "One cell of the last run as images: the current picture, the saved baseline, and the diff (the baseline faded, changed pixels in red), plus the unified diff of the rendered markup. Also opens the cell in the Matrix tab so the person sees it."),
      inputSchema: { cell: cellSchema, images: z.enum(["all", "current", "diff"]).default("all") },
    },
    guard(async ({ cell, images }): Promise<CallToolResult> => {
      const r = await shell("matrix", { action: "open", cell: cell as CellKey });
      const d = r.detail!;
      const png = (u: string | null) => (u ? u.replace(/^data:image\/png;base64,/, "") : null);
      const content: CallToolResult["content"] = [
        { type: "text", text: JSON.stringify({ ...brief(d.cell), id: cellId(d.cell), baselineSavedAt: d.baselineSavedAt ? new Date(d.baselineSavedAt).toISOString() : null, ...(d.sizeChange ? { sizeChange: d.sizeChange } : {}), markupDiff: d.markupDiff || null }, null, 2) },
      ];
      const add = (label: string, data: string | null) => {
        if (data) content.push({ type: "text", text: label }, { type: "image", data, mimeType: "image/png" });
      };
      if (images !== "diff") add("Current:", png(d.current));
      if (images === "all") add("Baseline:", png(d.baseline));
      if (images !== "current") add("Diff:", png(d.diff));
      return { content };
    }),
  );

  server.registerTool(
    "save_matrix_baselines",
    {
      ...write("Save matrix baselines", "Saves the last run's pictures (and rendered markup) of the cells as their baselines: what the next run compares against. Saves exactly what run_matrix rendered, so run it first. Baselines are kept in the Designer's data directory, not in the project.", true),
      inputSchema: { cells: which },
    },
    guard(async ({ cells }) => matrixView(await shell("matrix", { action: "baseline", which: cells as "all" | "changed" | CellKey[] }))),
  );

  server.registerTool(
    "forget_matrix_baselines",
    {
      ...write("Forget matrix baselines", "Deletes saved baselines (the cells named, or `all`); those cells are `new` again on the next run.", true),
      inputSchema: { cells: z.union([z.literal("all"), z.array(cellSchema).min(1)]) },
    },
    guard(async ({ cells }) => matrixView(await shell("matrix", { action: "forget", which: cells as "all" | CellKey[] }))),
  );
}
