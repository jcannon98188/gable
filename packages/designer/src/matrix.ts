// The Scenario by breakpoint matrix (TASK-56.22): every Scenario (a scene of a `*.scenes.ts` file) rendered at several widths,
// saved as baseline images, and compared against them. Types shared by the backend, the shell and the MCP tools; no Node
// imports, so the shell can use this file. The rendering and the image work are in `server/matrix.ts` and `server/png.ts`.

/** One column of the matrix: a viewport width in CSS pixels. */
export interface MatrixBreakpoint {
  name: string;
  width: number;
}

/** The columns used when none are given: the Tailwind breakpoints plus a phone width. */
export const DEFAULT_BREAKPOINTS: readonly MatrixBreakpoint[] = [
  { name: "phone", width: 375 },
  { name: "md", width: 768 },
  { name: "lg", width: 1024 },
  { name: "xl", width: 1280 },
];

export const MATRIX_HEIGHT = 720;
/** The grid is capped so one run stays quick and the answer stays small. */
export const MAX_MATRIX_CELLS = 48;
export const MAX_MATRIX_WIDTHS = 6;

export interface MatrixRequest {
  /** Only these scenes files (root-relative, `/src/x.scenes.ts`); all of them when omitted. */
  files?: string[];
  /** Only these scene names (of the files selected). */
  scenes?: string[];
  breakpoints?: MatrixBreakpoint[];
  /** The viewport height of every cell. */
  height?: number;
}

export interface CellKey {
  /** The scenes file, `/src/x.scenes.ts`. */
  file: string;
  scene: string;
  width: number;
}

/**
 * `new`: no baseline yet. `same`: pixels match the baseline. `changed`: pixels differ (`changedRatio`). `markup`: pixels
 * match but the rendered DOM differs (something invisible changed). `error`: the scene did not render (`error` says why).
 */
export type CellStatus = "new" | "same" | "changed" | "markup" | "error";

export interface MatrixCell extends CellKey {
  component: string | null;
  height: number;
  status: CellStatus;
  error?: string;
  /** The page's own size at that width (content may be taller than the viewport). */
  contentHeight?: number;
  /** Pixels that differ from the baseline, and the share of the cell. */
  changedPixels?: number;
  changedRatio?: number;
  /** The smallest box holding every changed pixel. */
  box?: { x: number; y: number; width: number; height: number } | null;
  /** The cell's picture as a PNG data URL (the grid thumbnail). */
  image?: string;
  /** Console errors the page logged while it rendered. */
  console?: string[];
}

export interface MatrixRun {
  /** When the run finished (ms since the epoch). */
  at: number;
  breakpoints: MatrixBreakpoint[];
  height: number;
  /** Rows are scenes (file then scene), columns are the breakpoints in order. */
  rows: Array<{ file: string; scene: string; component: string | null; description: string | null }>;
  cells: MatrixCell[];
  counts: { total: number; new: number; same: number; changed: number; markup: number; error: number; withBaseline: number };
  /** What produced the pictures: a headless browser on this machine. */
  renderer: string;
  note: string;
}

/** One cell opened: its current picture, the baseline, the pixel diff and the markup diff. */
export interface MatrixDetail {
  cell: MatrixCell;
  current: string | null;
  baseline: string | null;
  /** The baseline faded with the changed pixels in red; null when there is nothing to compare. */
  diff: string | null;
  baselineSavedAt: number | null;
  /** Unified diff of the rendered markup (baseline to current); empty when they match or there is no baseline. */
  markupDiff: string;
  /** The baseline's size when it differs from the current one. */
  sizeChange: { from: { width: number; height: number }; to: { width: number; height: number } } | null;
}

export type MatrixCommand =
  | { action: "report" }
  | { action: "run"; request?: MatrixRequest }
  | { action: "baseline"; /** `all`, `changed` (changed, new and markup cells) or the cells named. */ which: "all" | "changed" | CellKey[] }
  | { action: "detail"; cell: CellKey }
  | { action: "forget"; which: "all" | CellKey[] }
  | { action: "open"; cell: CellKey };

export interface MatrixCommandResult {
  run: MatrixRun | null;
  /** `baseline`: how many cells were saved or forgotten. */
  saved?: number;
  detail?: MatrixDetail;
}

export const cellId = (c: CellKey): string => `${c.file}|${c.scene}|${c.width}`;

/** The scene count and the cell count a request would render, checked against the caps. */
export function matrixProblem(rows: number, widths: number): string | null {
  if (rows === 0) return "There are no scenes to render: add a *.scenes.ts file next to a component.";
  if (widths === 0) return "Give at least one breakpoint.";
  if (widths > MAX_MATRIX_WIDTHS) return `At most ${MAX_MATRIX_WIDTHS} breakpoints.`;
  if (rows * widths > MAX_MATRIX_CELLS) return `That is ${rows * widths} cells; the most is ${MAX_MATRIX_CELLS}. Narrow it to some files or scenes, or use fewer breakpoints.`;
  return null;
}

export function sanitizeBreakpoints(value: unknown): MatrixBreakpoint[] {
  if (!Array.isArray(value)) return DEFAULT_BREAKPOINTS.map((b) => ({ ...b }));
  const seen = new Set<number>();
  const out: MatrixBreakpoint[] = [];
  for (const v of value) {
    const b = v as Partial<MatrixBreakpoint> | null;
    const width = Math.round(Number(b?.width));
    if (!Number.isFinite(width) || width < 200 || width > 4000 || seen.has(width)) continue;
    seen.add(width);
    out.push({ name: typeof b?.name === "string" && b.name.trim() ? b.name.trim().slice(0, 24) : `${width}`, width });
  }
  return out.sort((a, b) => a.width - b.width);
}
