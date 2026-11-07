// The Preview agent's accessibility checks: axe-core run against the page as it is rendered (real layout and painted colours,
// so contrast is measured, unlike under jsdom), each finding tied to the template node that renders its element. The checker
// is not part of the agent bundle: the Designer's Vite plugin serves the Designer's own axe-core at `AXE_PATH` and it is
// loaded on the first run.
import type { DesignNode } from "@gable/core/designer";
import type { A11yCheck, A11yReport } from "../protocol.js";

/** The slice of axe-core's API and results the agent reads. */
export interface AxeCheckResult {
  message: string;
}
export interface AxeNodeResult {
  html: string;
  target: unknown[];
  impact?: string | null;
  failureSummary?: string;
  element?: Element;
  any?: AxeCheckResult[];
  all?: AxeCheckResult[];
  none?: AxeCheckResult[];
}
export interface AxeRuleResult {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNodeResult[];
}
export interface AxeResults {
  violations: AxeRuleResult[];
  incomplete: AxeRuleResult[];
  passes: AxeRuleResult[];
  inapplicable: AxeRuleResult[];
}
export interface AxeLike {
  version: string;
  run(context: unknown, options: unknown): Promise<AxeResults>;
}

/**
 * Rules that judge a whole document (title, language, landmarks, a first heading, skip links). Component mode mounts one
 * component in the Designer's own host page, so there they would report on that page, not on the component: they are off.
 */
export const PAGE_RULES: readonly string[] = ["document-title", "html-has-lang", "html-lang-valid", "landmark-one-main", "page-has-heading-one", "region", "bypass"];

const IMPACTS = new Set(["minor", "moderate", "serious", "critical"]);
const MAX_HTML = 240;

const selectorOf = (target: unknown[]): string => target.map((t) => (Array.isArray(t) ? t.join(" >>> ") : String(t))).join(" | ");

/** What is wrong, in one line: axe's failure summary without its "Fix any of the following:" headings. */
function summaryOf(node: AxeNodeResult): string {
  const text =
    node.failureSummary ??
    [...(node.any ?? []), ...(node.all ?? []), ...(node.none ?? [])]
      .map((c) => c.message)
      .filter(Boolean)
      .join("\n");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^Fix (any|all) of the following:$/.test(l))
    .join(" ");
}

export interface ReportContext {
  url: string;
  mode: "page" | "component";
  skipped: string[];
  ms: number;
  engine: string;
  nodeOf(element: Element): DesignNode | null;
}

/** Turns axe's results into the protocol's report: one check per element and rule, failures first, each tied to its template node. */
export function toReport(results: AxeResults, ctx: ReportContext): A11yReport {
  const checks: A11yCheck[] = [];
  const add = (kind: A11yCheck["kind"], rules: AxeRuleResult[]) => {
    for (const rule of rules) {
      rule.nodes.forEach((n, i) => {
        const impact = n.impact ?? rule.impact ?? null;
        const node = n.element ? ctx.nodeOf(n.element) : null;
        checks.push({
          id: `${kind}:${rule.id}:${i}`,
          rule: rule.id,
          kind,
          impact: impact && IMPACTS.has(impact) ? (impact as A11yCheck["impact"]) : null,
          help: rule.help,
          helpUrl: rule.helpUrl,
          summary: summaryOf(n),
          html: n.html.length > MAX_HTML ? n.html.slice(0, MAX_HTML - 1) + "…" : n.html,
          selector: selectorOf(n.target),
          node: node ? { id: node.id, tag: node.tag, component: node.component?.name ?? null } : null,
        });
      });
    }
  };
  add("violation", results.violations);
  add("review", results.incomplete);
  const failed = new Set([...results.violations, ...results.incomplete].map((r) => r.id));
  const ran = new Set([...results.violations, ...results.incomplete, ...results.passes, ...results.inapplicable].map((r) => r.id));
  return {
    engine: ctx.engine,
    url: ctx.url,
    mode: ctx.mode,
    rules: ran.size,
    skipped: ctx.skipped,
    passed: results.passes.filter((r) => !failed.has(r.id)).length,
    checks,
    ms: Math.round(ctx.ms),
  };
}

/** The options for one run: element references (to find template nodes), only the result types that are listed, page rules off in component mode. */
export function runOptions(mode: "page" | "component"): { options: Record<string, unknown>; skipped: string[] } {
  const skipped = mode === "component" ? [...PAGE_RULES] : [];
  return {
    skipped,
    options: {
      elementRef: true,
      resultTypes: ["violations", "incomplete"],
      rules: Object.fromEntries(skipped.map((id) => [id, { enabled: false }])),
    },
  };
}

/** The run context: the whole document except the Designer's own overlay. */
export const RUN_CONTEXT = { exclude: [["[data-gable-designer]"]] };
