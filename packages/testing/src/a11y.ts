// Accessibility assertions for mounted fixtures, powered by axe-core. Separate entry (`@gable/testing/a11y`) so the
// main entry never imports axe-core, which is an optional peer dependency.
import type { Fixture } from "./index.js";

/** The slice of an axe-core result this helper reads. */
interface AxeNode {
  html: string;
  target: unknown[];
  failureSummary?: string;
}
interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNode[];
}
interface AxeLike {
  run(context: unknown, options: unknown): Promise<{ violations: AxeViolation[] }>;
}

/**
 * Rules switched off by default because jsdom cannot evaluate them (no layout, no painted colours, no scroll
 * metrics) or because they judge a whole page rather than the fragment a fixture mounts.
 */
export const JSDOM_UNSUPPORTED_RULES: readonly string[] = [
  "color-contrast",
  "color-contrast-enhanced",
  "link-in-text-block",
  "scrollable-region-focusable",
  "region",
  "landmark-one-main",
  "page-has-heading-one",
  "bypass",
  "document-title",
  "html-has-lang",
  "html-lang-valid",
];

export interface A11yOptions {
  /** Extra rule ids to disable, added to {@link JSDOM_UNSUPPORTED_RULES}. */
  disableRules?: readonly string[];
  /** Rule ids to keep enabled even though they are disabled by default (for a real browser runner). */
  enableRules?: readonly string[];
  /** Restrict the run to these axe tags (e.g. `["wcag2a", "wcag2aa"]`). */
  tags?: readonly string[];
  /** Extra raw axe `RunOptions`, merged last. */
  axeOptions?: Record<string, unknown>;
  /** An axe-core instance; defaults to `import("axe-core")`. */
  axe?: unknown;
}

/** What the helper can scan: a DOM-renderer fixture, an Element, or a Document. */
export type A11yTarget = Fixture<any> | Element | Document;

function resolveTarget(target: A11yTarget): Element | Document {
  const node = target as { nodeType?: number; root?: unknown };
  if (node.nodeType === 1 || node.nodeType === 9) return target as Element | Document;
  const root = node.root as { nodeType?: number; kind?: unknown } | undefined;
  if (root && root.nodeType === 1) return root as unknown as Element;
  if (root && "kind" in root) {
    throw new Error(
      "expectNoA11yViolations needs a real DOM: this fixture was mounted with the in-memory test renderer. " +
        "Run the test under jsdom (`// @vitest-environment jsdom`), boot the component with `bootstrap(Component, { renderer: dom(), target })` " +
        "from @gable/renderer-dom, and pass the host element.",
    );
  }
  throw new Error("expectNoA11yViolations: pass a fixture backed by the DOM renderer, an Element, or a Document.");
}

async function loadAxe(options: A11yOptions): Promise<AxeLike> {
  if (options.axe) return options.axe as AxeLike;
  try {
    const mod: any = await import("axe-core");
    return (mod.default ?? mod) as AxeLike;
  } catch (cause) {
    throw new Error("expectNoA11yViolations requires the optional peer dependency axe-core: `npm i -D axe-core`.", { cause });
  }
}

/** Formats violations as a readable, multi-line report. */
export function formatA11yViolations(violations: readonly AxeViolation[]): string {
  const lines = [`${violations.length} accessibility violation${violations.length === 1 ? "" : "s"}:`];
  for (const v of violations) {
    lines.push("", `[${v.impact ?? "unknown"}] ${v.id}: ${v.help}`, `  ${v.helpUrl}`);
    for (const n of v.nodes) {
      lines.push(`  - ${n.target.map(String).join(" ")}`, `    ${n.html.replace(/\s+/g, " ").slice(0, 200)}`);
      const summary = n.failureSummary?.split("\n").map((l) => l.trim()).filter(Boolean);
      if (summary) lines.push(...summary.map((l) => `    ${l}`));
    }
  }
  return lines.join("\n");
}

/** Runs axe-core and returns the violations (use {@link expectNoA11yViolations} to assert). */
export async function a11yViolations(target: A11yTarget, options: A11yOptions = {}): Promise<AxeViolation[]> {
  const context = resolveTarget(target);
  const axe = await loadAxe(options);
  const enabled = new Set(options.enableRules ?? []);
  const rules: Record<string, { enabled: boolean }> = {};
  for (const id of [...JSDOM_UNSUPPORTED_RULES, ...(options.disableRules ?? [])]) if (!enabled.has(id)) rules[id] = { enabled: false };
  const runOptions: Record<string, unknown> = { rules, ...(options.tags ? { runOnly: { type: "tag", values: [...options.tags] } } : {}), ...options.axeOptions };
  const { violations } = await axe.run(context, runOptions);
  return violations;
}

/**
 * Fails with a readable report when axe-core finds accessibility violations in a mounted DOM.
 * Needs the DOM renderer under jsdom; see docs/accessibility.md.
 */
export async function expectNoA11yViolations(target: A11yTarget, options: A11yOptions = {}): Promise<void> {
  const violations = await a11yViolations(target, options);
  if (violations.length) throw new Error(formatA11yViolations(violations));
}
