// Accessibility lint rules for templates. They work on the scanned template tree only (no types),
// so a binding such as [alt]="x" or [attr.aria-label]="x" counts as the attribute being present.
// Each rule reports through `report(start, length, rule, message)` like the other file rules.

import type { RuleId } from "./config.js";
import type { TemplateModel } from "./emit.js";
import { closest } from "./typeutil.js";
import type { ElementNode, TNode } from "./scan.js";

export type Report = (start: number, length: number, rule: RuleId, message: string) => void;

const ROLES = new Set(
  (
    "alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem"
  ).split(" "),
);

const ARIA_ATTRS = new Set(
  (
    "activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext"
  )
    .split(" ")
    .map((a) => `aria-${a}`),
);

/** Attributes whose static value must be one of a closed set. */
const BOOLEAN = ["true", "false"];
const ARIA_VALUES: Record<string, string[]> = {
  "aria-atomic": BOOLEAN,
  "aria-busy": BOOLEAN,
  "aria-disabled": BOOLEAN,
  "aria-hidden": [...BOOLEAN, "undefined"],
  "aria-modal": BOOLEAN,
  "aria-multiline": BOOLEAN,
  "aria-multiselectable": BOOLEAN,
  "aria-readonly": BOOLEAN,
  "aria-required": BOOLEAN,
  "aria-expanded": [...BOOLEAN, "undefined"],
  "aria-selected": [...BOOLEAN, "undefined"],
  "aria-checked": [...BOOLEAN, "mixed", "undefined"],
  "aria-pressed": [...BOOLEAN, "mixed", "undefined"],
  "aria-live": ["off", "polite", "assertive"],
  "aria-orientation": ["horizontal", "vertical", "undefined"],
  "aria-invalid": ["true", "false", "grammar", "spelling"],
};

const INTERACTIVE = new Set(["a", "button", "input", "select", "textarea", "summary", "option", "details", "audio", "video", "label", "dialog", "iframe", "embed", "object"]);
const NO_NAME_INPUT = new Set(["hidden", "submit", "reset", "button", "image"]);
const KEY_HANDLERS = ["keydown", "keyup", "keypress"];

/** What an element carries, by lower-cased name: static attributes, `[x]` and `[attr.x]` bindings, and event handlers. */
interface Facts {
  el: ElementNode;
  tag: string;
  statics: Map<string, { value?: string; at: number }>;
  bound: Map<string, number>;
  handlers: Set<string>;
}

function facts(el: ElementNode): Facts {
  const statics = new Map<string, { value?: string; at: number }>();
  for (const a of el.attrs) statics.set(a.name.toLowerCase(), { value: a.value, at: a.nameStart });
  const bound = new Map<string, number>();
  const handlers = new Set<string>();
  for (const x of el.expressions) {
    if (x.kind === "handler") handlers.add(x.name.toLowerCase());
    else if (x.kind === "value" || x.kind === "model") bound.set(x.name.replace(/^attr\./, "").toLowerCase(), x.nameStart);
  }
  return { el, tag: el.tag.toLowerCase(), statics, bound, handlers };
}

const has = (f: Facts, name: string): boolean => f.statics.has(name) || f.bound.has(name);
const isComponent = (tag: string): boolean => tag.includes("-");

interface Walk {
  element?: (f: Facts, ancestors: Facts[]) => void;
  /** When set, called for if/switch alternatives instead of walking them in sequence. */
  branches?: (groups: TNode[][]) => void;
}

/** Elements in document order, with their ancestors, calling `element` before descending. */
function walk(nodes: TNode[], v: Walk, ancestors: Facts[] = []): void {
  const alternatives = (groups: TNode[][]) => {
    if (v.branches) v.branches(groups);
    else for (const g of groups) walk(g, v, ancestors);
  };
  for (const node of nodes) {
    switch (node.type) {
      case "element": {
        const f = facts(node);
        v.element?.(f, ancestors);
        walk(node.children, v, [...ancestors, f]);
        break;
      }
      case "if":
        alternatives(node.branches.map((b) => b.children));
        break;
      case "switch":
        alternatives(node.cases.map((c) => c.children));
        break;
      case "for":
        walk(node.children, v, ancestors);
        if (node.empty) walk(node.empty, v, ancestors);
        break;
      case "defer":
        for (const section of [node.children, node.placeholder, node.loading, node.error]) if (section) walk(section, v, ancestors);
        break;
    }
  }
}

/** Whether anything under `nodes` can give an accessible name: text, an interpolation, a named or custom element. */
function providesName(nodes: TNode[]): boolean {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        return true;
      case "element": {
        const f = facts(node);
        if (isComponent(f.tag) || ["aria-label", "aria-labelledby", "title"].some((n) => has(f, n))) return true;
        if (f.tag === "img" && has(f, "alt") && f.statics.get("alt")?.value !== "") return true;
        if (providesName(node.children)) return true;
        break;
      }
      case "if":
        if (node.branches.some((b) => providesName(b.children))) return true;
        break;
      case "for":
        if (providesName(node.children)) return true;
        break;
      case "switch":
        if (node.cases.some((c) => providesName(c.children))) return true;
        break;
      case "defer":
        if ([node.children, node.placeholder, node.loading, node.error].some((s) => s && providesName(s))) return true;
        break;
    }
  }
  return false;
}

export function a11yRules(model: TemplateModel, report: Report): void {
  // Which ids a <label for> points at (and whether any `for` is dynamic, in which case ids are trusted).
  const labelledIds = new Set<string>();
  let dynamicFor = false;
  walk(model.tree, {
    element: (f) => {
      if (f.tag !== "label") return;
      const value = f.statics.get("for")?.value;
      if (value) labelledIds.add(value);
      if (f.bound.has("for") || f.bound.has("htmlfor")) dynamicFor = true;
    },
  });

  walk(model.tree, {
    element: (f, ancestors) => {
      const { tag } = f;
      const at = f.el.tagStart;
      const len = f.el.tag.length;

      // a11y-img-alt
      if (tag === "img" && !has(f, "alt") && !/^(presentation|none)$/.test(f.statics.get("role")?.value ?? "")) {
        report(at, len, "a11y-img-alt", `<img> needs an alt attribute: describe the image, or use alt="" when it is decorative`);
      }

      // a11y-control-name
      const named = ["aria-label", "aria-labelledby", "title"].some((n) => has(f, n));
      if (tag === "button" && !named && !providesName(f.el.children)) {
        report(at, len, "a11y-control-name", `<button> has no accessible name: give it text content, aria-label or aria-labelledby`);
      } else if (tag === "a" && ["href", "routerlink"].some((n) => has(f, n)) && !named && !providesName(f.el.children)) {
        report(at, len, "a11y-control-name", `<a> link has no accessible name: give it text content, aria-label or aria-labelledby`);
      } else if (tag === "input" || tag === "select" || tag === "textarea") {
        const type = (f.statics.get("type")?.value ?? "text").toLowerCase();
        if (tag === "input" && (NO_NAME_INPUT.has(type) || f.bound.has("type"))) {
          if (type === "image" && !named && !has(f, "alt")) report(at, len, "a11y-control-name", `<input type="image"> needs an alt attribute or aria-label`);
        } else if (!named) {
          const id = f.statics.get("id")?.value;
          const byFor = id !== undefined && (labelledIds.has(id) || (dynamicFor && id !== ""));
          const wrapped = ancestors.some((a) => a.tag === "label");
          if (!byFor && !wrapped && !f.bound.has("id")) {
            report(at, len, "a11y-control-name", `<${tag}> has no label: wrap it in a <label>, point a <label for> at its id, or add aria-label or aria-labelledby (a placeholder is not a label)`);
          }
        }
      }

      // a11y-aria-valid
      const role = f.statics.get("role");
      if (role?.value !== undefined) {
        for (const token of role.value.trim().split(/\s+/)) {
          if (token && !ROLES.has(token) && !/^(doc|graphics)-[a-z]+$/.test(token)) {
            report(role.at, 4, "a11y-aria-valid", `"${token}" is not a valid ARIA role`);
          }
        }
      }
      const ariaNames = [
        ...[...f.statics].map(([name, v]) => ({ name, at: v.at, value: v.value, dynamic: false })),
        ...[...f.bound].map(([name, boundAt]) => ({ name, at: boundAt, value: undefined, dynamic: true })),
      ].filter((a) => a.name.startsWith("aria-"));
      for (const a of ariaNames) {
        if (!ARIA_ATTRS.has(a.name)) {
          const hint = closest(a.name, [...ARIA_ATTRS]);
          report(a.at, a.name.length, "a11y-aria-valid", `"${a.name}" is not a valid ARIA attribute${hint ? `. Did you mean "${hint}"?` : ""}`);
        } else if (!a.dynamic && a.value !== undefined && ARIA_VALUES[a.name] && !ARIA_VALUES[a.name]!.includes(a.value.trim())) {
          report(a.at, a.name.length, "a11y-aria-valid", `${a.name}="${a.value}" is not a valid value: use ${ARIA_VALUES[a.name]!.map((x) => `"${x}"`).join(", ")}`);
        }
      }

      // a11y-click-key
      if (f.handlers.has("click") && !INTERACTIVE.has(tag) && !isComponent(tag)) {
        const missing: string[] = [];
        if (!has(f, "role")) missing.push("a role");
        if (!KEY_HANDLERS.some((k) => f.handlers.has(k))) missing.push("a keyboard handler ((keydown) or (keyup))");
        if (missing.length) {
          const x = f.el.expressions.find((e) => e.kind === "handler" && e.name.toLowerCase() === "click")!;
          report(x.nameStart, 5, "a11y-click-key", `<${f.el.tag}> has a (click) handler but keyboard and assistive technology users cannot use it: add ${missing.join(" and ")}, or use a <button>`);
        }
      }

      // a11y-tabindex-positive
      const tab = f.statics.get("tabindex");
      const tabBound = f.el.expressions.find((e) => e.kind === "value" && e.name.replace(/^attr\./, "").toLowerCase() === "tabindex");
      const tabValue = tab ? tab.value : tabBound?.text;
      if (tabValue !== undefined && /^\+?\d+$/.test(tabValue.trim()) && Number(tabValue) > 0) {
        report(tab ? tab.at : tabBound!.nameStart, 8, "a11y-tabindex-positive", `tabindex="${tabValue.trim()}" overrides the natural tab order: use tabindex="0" or "-1" and order the DOM instead`);
      }

      // a11y-autofocus
      if (has(f, "autofocus")) {
        const inDialog = ancestors.some((a) => a.tag === "dialog" || /^(dialog|alertdialog)$/.test(a.statics.get("role")?.value ?? ""));
        if (!inDialog && tag !== "dialog") {
          report(f.statics.get("autofocus")?.at ?? f.bound.get("autofocus")!, 9, "a11y-autofocus", `autofocus moves focus without the user asking for it, which disorients screen reader and keyboard users: focus from code after a user action instead (allowed inside a dialog)`);
        }
      }
    },
  });

  // a11y-heading-order: a heading may go one level deeper than the previous one, or back up to any level.
  let previous = 0;
  const check = (nodes: TNode[]): void => {
    walk(nodes, {
      element: (f) => {
        const m = /^h([1-6])$/.exec(f.tag);
        if (!m) return;
        const level = Number(m[1]);
        if (previous > 0 && level > previous + 1) {
          report(f.el.tagStart, 2, "a11y-heading-order", `<${f.tag}> skips a level after <h${previous}>: use <h${previous + 1}> so the outline has no gaps`);
        }
        previous = level;
      },
      branches: (groups) => {
        const before = previous;
        let deepest = before;
        for (const g of groups) {
          previous = before;
          check(g);
          deepest = Math.max(deepest, previous);
        }
        previous = deepest;
      },
    });
  };
  check(model.tree);
}
