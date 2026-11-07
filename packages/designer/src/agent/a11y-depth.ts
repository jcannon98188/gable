// Accessibility beyond the checker (TASK-56.26): the keyboard focus order of the page, the accessibility tree (what assistive
// technology is given: role, name, state), and stepping focus through the page. All of it reads the real DOM as rendered; the
// functions here take the document and a template-node lookup, so they run under jsdom in tests as well as in the Preview agent.
// Names and roles follow the HTML-AAM and accname rules for the cases apps use; shadow DOM, CSS-generated content and
// `aria-owns` are not followed (the reports say so). Nothing here writes to the page except `stepFocus`, which moves focus.
import type { A11yTreeNode, A11yTreeReport, FocusEntry, FocusOrderReport, FocusStepResult } from "../protocol.js";

export interface NodeRef {
  id: string;
  tag: string;
  component: string | null;
}
/** The template node that renders an element, or its nearest ancestor that one renders; null when none does. */
export type NodeLookup = (el: Element) => NodeRef | null;

const OVERLAY = "[data-gable-designer]";
const SKIP_TAGS = new Set(["script", "style", "template", "noscript", "head", "meta", "link", "title", "base"]);

// --- visibility -------------------------------------------------------------------------------------------------------

/** Not rendered or not exposed: `hidden`, `display: none` (on it or an ancestor), `visibility: hidden`, `inert`. */
function isHidden(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.hasAttribute("hidden") || e.hasAttribute("inert")) return true;
    if (view.getComputedStyle(e).display === "none") return true;
  }
  return view.getComputedStyle(el).visibility === "hidden" || view.getComputedStyle(el).visibility === "collapse";
}

const ariaHidden = (el: Element): boolean => !!el.closest('[aria-hidden="true"]');

// --- roles ------------------------------------------------------------------------------------------------------------

const INPUT_ROLES: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  text: "textbox",
  email: "textbox",
  tel: "textbox",
  url: "textbox",
  password: "textbox",
};
const SECTIONING = "article, aside, main, nav, section";

/** The element's role: the first valid token of `role`, else the HTML default; "generic" when it has none. */
export function roleOf(el: Element): string {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0]?.toLowerCase();
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "a":
    case "area":
      return el.hasAttribute("href") ? "link" : "generic";
    case "button":
    case "summary":
      return "button";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "img":
      return el.getAttribute("alt") === "" ? "presentation" : "img";
    case "input": {
      const type = ((el as HTMLInputElement).type || "text").toLowerCase();
      if (type === "hidden") return "none";
      if (type === "text" && el.hasAttribute("list")) return "combobox";
      return INPUT_ROLES[type] ?? "textbox";
    }
    case "textarea":
      return "textbox";
    case "select":
      return (el as HTMLSelectElement).multiple || Number(el.getAttribute("size")) > 1 ? "listbox" : "combobox";
    case "option":
      return "option";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "header":
      return el.closest(SECTIONING) ? "generic" : "banner";
    case "footer":
      return el.closest(SECTIONING) ? "generic" : "contentinfo";
    case "aside":
      return "complementary";
    case "section":
      return labelled(el) ? "region" : "generic";
    case "form":
      return labelled(el) ? "form" : "generic";
    case "article":
      return "article";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "table":
      return "table";
    case "tr":
      return "row";
    case "td":
      return "cell";
    case "th":
      return "columnheader";
    case "dialog":
      return "dialog";
    case "details":
    case "fieldset":
      return "group";
    case "progress":
      return "progressbar";
    case "output":
      return "status";
    case "hr":
      return "separator";
    case "p":
      return "paragraph";
    case "figure":
      return "figure";
    case "menu":
      return "list";
    default:
      return "generic";
  }
}

const labelled = (el: Element): boolean => !!(el.getAttribute("aria-label")?.trim() || el.getAttribute("aria-labelledby")?.trim());

/** Roles whose name comes from their content. */
const NAME_FROM_CONTENT = new Set(["button", "link", "heading", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "checkbox", "radio", "switch", "cell", "columnheader", "rowheader", "treeitem", "tooltip", "listitem"]);
/** Roles whose children are presentational (not exposed). */
const CHILDREN_PRESENTATIONAL = new Set(["button", "checkbox", "img", "menuitemcheckbox", "menuitemradio", "option", "progressbar", "radio", "scrollbar", "separator", "slider", "switch", "tab"]);
/** Roles pruned from the tree (their children are lifted into the parent). */
const TRANSPARENT = new Set(["generic", "none", "presentation", "paragraph"]);
/** Roles that need an accessible name to be usable. */
const NEEDS_NAME = new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "listbox", "slider", "spinbutton", "switch", "menuitem", "tab", "img", "progressbar", "dialog"]);
/** Explicit roles that make an element behave as a control (it must be reachable by keyboard). */
const WIDGET_ROLES = new Set(["button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton", "textbox", "searchbox", "combobox", "treeitem"]);

// --- names ------------------------------------------------------------------------------------------------------------

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

function textOfContent(el: Element, seen: Set<Element>, labelledby: boolean): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) out += child.textContent ?? "";
    else if (child.nodeType === 1) {
      const c = child as Element;
      if (SKIP_TAGS.has(c.tagName.toLowerCase()) || c.matches(OVERLAY)) continue;
      if (!labelledby && (isHidden(c) || c.getAttribute("aria-hidden") === "true")) continue;
      const inner = nameOf(c, seen, true, labelledby);
      out += /^(block|flex|grid|list-item|table)/.test(c.ownerDocument.defaultView?.getComputedStyle(c).display ?? "") ? ` ${inner} ` : inner;
    }
  }
  return out;
}

/**
 * The accessible name (accname, the common cases in order): `aria-labelledby`, `aria-label`, the native label (`<label>`,
 * `alt`, `value` of a button, `<legend>`, `<caption>`, `<figcaption>`), then the content for roles that take their name
 * from it, then `title`, then `placeholder`. Empty when there is none.
 */
export function nameOf(el: Element, seen: Set<Element> = new Set(), embedded = false, labelledby = false): string {
  if (seen.has(el)) return "";
  seen.add(el);
  const doc = el.ownerDocument;
  if (!embedded) {
    const ids = el.getAttribute("aria-labelledby")?.trim().split(/\s+/) ?? [];
    const named = ids.map((id) => doc.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (named.length) {
      const text = squash(named.map((e) => nameOf(e, new Set(seen), true, true)).join(" "));
      if (text) return text;
    }
  }
  const label = squash(el.getAttribute("aria-label") ?? "");
  if (label) return label;
  const tag = el.tagName.toLowerCase();
  const role = roleOf(el);
  if (tag === "img" || tag === "area" || (tag === "input" && (el as HTMLInputElement).type === "image")) {
    const alt = squash(el.getAttribute("alt") ?? "");
    if (alt) return alt;
  }
  if (tag === "input") {
    const input = el as HTMLInputElement;
    if (["button", "submit", "reset"].includes(input.type)) {
      const v = squash(input.getAttribute("value") ?? "");
      return v || (input.type === "submit" ? "Submit" : input.type === "reset" ? "Reset" : "");
    }
  }
  if (!embedded && ("labels" in el)) {
    const labels = Array.from((el as HTMLInputElement).labels ?? []);
    const text = squash(labels.map((l) => textOfContent(l, new Set(seen), labelledby)).join(" "));
    if (text) return text;
  }
  if (tag === "fieldset") {
    const legend = el.querySelector(":scope > legend");
    if (legend) return squash(textOfContent(legend, new Set(seen), labelledby));
  }
  if (tag === "table") {
    const cap = el.querySelector(":scope > caption");
    if (cap) return squash(textOfContent(cap, new Set(seen), labelledby));
  }
  if (tag === "figure") {
    const cap = el.querySelector(":scope > figcaption");
    if (cap) return squash(textOfContent(cap, new Set(seen), labelledby));
  }
  if (tag === "details") {
    const sum = el.querySelector(":scope > summary");
    if (sum) return squash(textOfContent(sum, new Set(seen), labelledby));
  }
  if (embedded || NAME_FROM_CONTENT.has(role)) {
    const text = squash(textOfContent(el, seen, labelledby));
    if (text) return text;
  }
  const title = squash(el.getAttribute("title") ?? "");
  if (title) return title;
  if (tag === "input" || tag === "textarea") return squash(el.getAttribute("placeholder") ?? "");
  return "";
}

// --- focus ------------------------------------------------------------------------------------------------------------

const tabindexOf = (el: Element): number | null => {
  const raw = el.getAttribute("tabindex");
  if (raw === null || raw.trim() === "" || !/^[+-]?\d+$/.test(raw.trim())) return null;
  return parseInt(raw, 10);
};

/** Natively focusable (without `tabindex`): links with href, enabled form controls, summary, editable and embedded content. */
function nativelyFocusable(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "a" || tag === "area") return el.hasAttribute("href");
  if (tag === "button" || tag === "select" || tag === "textarea") return true;
  if (tag === "input") return (el as HTMLInputElement).type !== "hidden";
  if (tag === "summary") return el.parentElement?.tagName.toLowerCase() === "details" && el.parentElement.firstElementChild === el;
  if (tag === "iframe") return true;
  if ((tag === "audio" || tag === "video") && el.hasAttribute("controls")) return true;
  const ce = el.getAttribute("contenteditable");
  return ce !== null && ce !== "false";
}

function isDisabled(el: Element): boolean {
  if (!/^(button|input|select|textarea|fieldset|optgroup|option)$/i.test(el.tagName)) return false;
  if (el.hasAttribute("disabled")) return true;
  const fs = el.parentElement?.closest("fieldset[disabled]");
  return !!fs && !el.closest("legend");
}

/** What the element can do with the keyboard: `tab` (in the tab order), `script` (focusable by script or click only), or null. */
function focusability(el: Element): { kind: "tab" | "script"; tabindex: number | null } | null {
  if (isDisabled(el) || isHidden(el) || el.matches(OVERLAY) || el.closest(OVERLAY)) return null;
  const tabindex = tabindexOf(el);
  if (tabindex === null) return nativelyFocusable(el) ? { kind: "tab", tabindex: null } : null;
  return { kind: tabindex >= 0 ? "tab" : "script", tabindex };
}

/** A radio group is one tab stop: the checked radio, else the first. */
function radioStops(radios: HTMLInputElement[]): Set<Element> {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const r of radios) {
    if (!r.name) continue;
    const key = `${(r.form && Array.from(r.ownerDocument.forms).indexOf(r.form)) ?? -1}|${r.name}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const skipped = new Set<Element>();
  for (const group of groups.values()) {
    const keep = group.find((r) => r.checked) ?? group[0]!;
    for (const r of group) if (r !== keep) skipped.add(r);
  }
  return skipped;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
};
const empty = (b: Box): boolean => b.width === 0 && b.height === 0;

/** The roots of the page's interactive content. The Designer's overlay is never part of it. */
const scopeOf = (doc: Document): Element => doc.body ?? doc.documentElement;

/** The elements in the order Tab visits them: positive `tabindex` ascending, then the rest in document order. */
export function tabOrder(doc: Document): Element[] {
  const all = Array.from(scopeOf(doc).querySelectorAll("*"));
  const stops: Array<{ el: Element; tabindex: number; i: number }> = [];
  const skippedRadios = radioStops(all.filter((e): e is HTMLInputElement => e instanceof (doc.defaultView as Window & typeof globalThis).HTMLInputElement && e.type === "radio" && focusability(e)?.kind === "tab"));
  all.forEach((el, i) => {
    const f = focusability(el);
    if (f?.kind !== "tab" || skippedRadios.has(el)) return;
    stops.push({ el, tabindex: f.tabindex ?? 0, i });
  });
  const positive = stops.filter((s) => s.tabindex > 0).sort((a, b) => a.tabindex - b.tabindex || a.i - b.i);
  return [...positive, ...stops.filter((s) => s.tabindex === 0)].map((s) => s.el);
}

export interface FocusOptions {
  nodeOf: NodeLookup;
  mode: "page" | "component";
  url: string;
}

/** The focus order report: every Tab stop with its name and role, what is wrong with the order, and what cannot be reached. */
export function focusOrder(doc: Document, o: FocusOptions): FocusOrderReport {
  return focusOrderOf(doc, o, tabOrder(doc));
}

/** `focusOrder` for an order already computed (`order[i]` is stop `i + 1`), so a caller that needs the elements computes it once. */
export function focusOrderOf(doc: Document, o: FocusOptions, order: Element[]): FocusOrderReport {
  const active = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  const entries: FocusEntry[] = [];
  let prev: Box | null = null;
  order.forEach((el, i) => {
    const box = boxOf(el);
    const name = nameOf(el);
    const warnings: FocusEntry["warnings"] = [];
    const tabindex = tabindexOf(el);
    if (tabindex !== null && tabindex > 0) warnings.push("positive-tabindex");
    if (!name && el.tagName.toLowerCase() !== "iframe") warnings.push("no-name");
    if (ariaHidden(el)) warnings.push("aria-hidden");
    // Focus jumps back up the page: this stop is entirely above the previous one.
    if (prev && !empty(prev) && !empty(box) && box.top + box.height <= prev.top) warnings.push("jumps-back");
    entries.push({
      index: i + 1,
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      name,
      tabindex,
      box,
      focused: el === active,
      warnings,
      node: o.nodeOf(el),
    });
    prev = box;
  });
  const scripted: FocusOrderReport["scripted"] = [];
  const unreachable: FocusOrderReport["unreachable"] = [];
  for (const el of Array.from(scopeOf(doc).querySelectorAll("*"))) {
    if (el.matches(OVERLAY) || el.closest(OVERLAY)) continue;
    const f = focusability(el);
    if (f?.kind === "script") scripted.push({ tag: el.tagName.toLowerCase(), role: roleOf(el), name: nameOf(el), tabindex: f.tabindex!, node: o.nodeOf(el) });
    else if (!f && !isHidden(el) && !ariaHidden(el) && el.hasAttribute("role") && WIDGET_ROLES.has(roleOf(el)) && !el.closest("a[href], button, input, select, textarea, summary")) {
      unreachable.push({ tag: el.tagName.toLowerCase(), role: roleOf(el), name: nameOf(el), reason: "Has a control role but cannot be focused: add tabindex=\"0\" (or use a native element)", node: o.nodeOf(el) });
    } else if (!f && el.hasAttribute("onclick") && !isHidden(el) && !nativelyFocusable(el) && !el.closest("a[href], button")) {
      unreachable.push({ tag: el.tagName.toLowerCase(), role: roleOf(el), name: nameOf(el) || squash(el.textContent ?? "").slice(0, 60), reason: "Has an inline click handler but cannot be focused by keyboard", node: o.nodeOf(el) });
    }
  }
  return {
    url: o.url,
    mode: o.mode,
    stops: entries,
    scripted,
    unreachable,
    focused: entries.find((e) => e.focused)?.index ?? null,
    activeElement: active ? { tag: active.tagName.toLowerCase(), name: nameOf(active), node: o.nodeOf(active) } : null,
    notes: ["Shadow DOM and cross-origin frames are not followed.", "The order is the browser's rule (positive tabindex first, then document order); a focus trap (script that moves focus) is found with a step run."],
  };
}

// --- the accessibility tree ---------------------------------------------------------------------------------------------

const MAX_NODES = 2500;

/** States and properties worth showing, from ARIA attributes and the HTML equivalents. */
function statesOf(el: Element, role: string): Record<string, string | number | boolean> {
  const s: Record<string, string | number | boolean> = {};
  const aria = (n: string) => el.getAttribute(`aria-${n}`);
  if (role === "heading") {
    const level = aria("level") ?? /^h([1-6])$/i.exec(el.tagName)?.[1];
    if (level) s.level = Number(level);
  }
  if ((el as HTMLInputElement).disabled || aria("disabled") === "true") s.disabled = true;
  if ((el as HTMLInputElement).required || aria("required") === "true") s.required = true;
  if (aria("invalid") === "true") s.invalid = true;
  if (["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio"].includes(role)) {
    const input = el as HTMLInputElement;
    const checked = aria("checked") ?? (el.tagName === "INPUT" ? (input.indeterminate ? "mixed" : String(input.checked)) : null);
    if (checked !== null) s.checked = checked === "mixed" ? "mixed" : checked === "true";
  }
  if (aria("expanded") !== null) s.expanded = aria("expanded") === "true";
  else if (el.tagName === "DETAILS") s.expanded = (el as HTMLDetailsElement).open;
  if (aria("selected") !== null) s.selected = aria("selected") === "true";
  else if (el.tagName === "OPTION") s.selected = (el as HTMLOptionElement).selected;
  if (aria("pressed") !== null) s.pressed = aria("pressed") === "mixed" ? "mixed" : aria("pressed") === "true";
  if (aria("current") && aria("current") !== "false") s.current = aria("current")!;
  if (aria("modal") === "true" || (el.tagName === "DIALOG" && (el as HTMLDialogElement).open && el.matches(":modal"))) s.modal = true;
  if (aria("haspopup") && aria("haspopup") !== "false") s.haspopup = aria("haspopup")!;
  if (aria("live") && aria("live") !== "off") s.live = aria("live")!;
  if (el.tagName === "INPUT" && ["textbox", "searchbox", "spinbutton", "slider"].includes(role) && (el as HTMLInputElement).type !== "password") {
    const v = (el as HTMLInputElement).value;
    if (v) s.value = v.length > 80 ? v.slice(0, 79) + "…" : v;
  }
  const description = squash(aria("describedby") ? (aria("describedby")!.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ")) : "");
  if (description) s.description = description.length > 120 ? description.slice(0, 119) + "…" : description;
  return s;
}

export interface TreeOptions {
  nodeOf: NodeLookup;
  mode: "page" | "component";
  url: string;
  /** The element to start from (the selected template node's first element); the whole page when absent. */
  root?: Element | null;
  rootNode?: { id: string; tag: string } | null;
}

/** The accessibility tree of the page (or of one element): roles, names and states, with generic wrappers left out. */
export function a11yTree(doc: Document, o: TreeOptions): A11yTreeReport {
  const start = o.root ?? scopeOf(doc);
  let count = 0;
  let truncated = false;
  let lastHeading = 0;
  let headingSkips = 0;
  let unnamed = 0;
  const focusable = new Set(tabOrder(doc));

  const walk = (el: Element): A11yTreeNode[] => {
    if (count >= MAX_NODES) return ((truncated = true), []);
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag) || el.matches(OVERLAY) || isHidden(el) || el.getAttribute("aria-hidden") === "true") return [];
    const role = roleOf(el);
    const kids = (): A11yTreeNode[] => {
      const out: A11yTreeNode[] = [];
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 1) out.push(...walk(child as Element));
        else if (child.nodeType === 3 && !NAME_FROM_CONTENT.has(role)) {
          const text = squash(child.textContent ?? "");
          if (text && count < MAX_NODES) (count++, out.push({ role: "text", name: text.length > 160 ? text.slice(0, 159) + "…" : text, states: {}, focusable: false, warnings: [], node: null, children: [] }));
        }
      }
      return out;
    };
    // A label's text is the name of its control, which is listed where the control is.
    if (tag === "label" && (el as HTMLLabelElement).control) return kids().filter((k) => k.role !== "text");
    if (TRANSPARENT.has(role) && !labelled(el)) return kids();
    // Presentational images and separators are dropped; a landmark or group without a name is kept (its role is the information).
    if (role === "presentation" || role === "none") return kids();
    count++;
    const name = nameOf(el);
    const states = statesOf(el, role);
    const warnings: string[] = [];
    if (NEEDS_NAME.has(role) && !name) {
      warnings.push("no-name");
      unnamed++;
    }
    if (role === "heading") {
      const level = Number(states.level ?? 0);
      if (!name) warnings.push("empty-heading");
      if (lastHeading && level > lastHeading + 1) (warnings.push(`heading-skip: h${lastHeading} to h${level}`), headingSkips++);
      lastHeading = level;
    }
    const children = CHILDREN_PRESENTATIONAL.has(role) ? [] : kids();
    return [{ role, name, states, focusable: focusable.has(el), warnings, node: o.nodeOf(el), children }];
  };

  const tree = start === scopeOf(doc) ? walk(start) : walk(start);
  return {
    url: o.url,
    mode: o.mode,
    root: o.rootNode ?? null,
    nodes: count,
    truncated,
    unnamed,
    headingSkips,
    tree,
    notes: ["Computed from the DOM by the Designer (roles by HTML-AAM, names by accname): close to what a browser exposes, not a dump of its accessibility tree.", "Shadow DOM, aria-owns and CSS-generated content are not followed."],
  };
}

// --- stepping focus -----------------------------------------------------------------------------------------------------

/** The look of an element's focus indication: what changes when it takes focus is its focus indicator. */
const indicatorKey = (el: Element): string => {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  return [cs.outline === "none" ? "" : cs.outline, cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.borderTopColor, cs.borderTopWidth, cs.backgroundColor, cs.textDecorationLine].join("|");
};

/** Whether focusing the element shows something: an outline, or a change of shadow, border, background or underline. */
export function hasFocusIndicator(el: HTMLElement): boolean {
  el.blur();
  const off = indicatorKey(el);
  el.focus({ preventScroll: true });
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  // Engines expand `outline` into longhands; the shorthand is read too, for the ones that do not.
  const outline = cs.outlineStyle ? cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 : !!cs.outline && !/none|(^|s)0(px)?(s|$)/.test(cs.outline);
  const changed = indicatorKey(el) !== off;
  return outline || changed;
}

export type FocusTarget = "next" | "prev" | "first" | "last";

/**
 * Moves focus as Tab would (a synthetic Tab key does not move focus in a browser): to the next or previous stop of the tab
 * order, wrapping at the ends. `steps` repeats it and reports every stop it visited, whether each shows a focus indicator,
 * and whether the run was trapped (focus did not move, or came back to a stop before the whole page was visited).
 */
export function stepFocus(doc: Document, o: { to: FocusTarget | { element: Element }; steps: number; nodeOf: NodeLookup }): FocusStepResult {
  const visited: FocusStepResult["visited"] = [];
  let trapped: string | null = null;
  const stops = tabOrder(doc);
  if (stops.length === 0) return { visited, stops: 0, trapped: null, wrapped: false, note: "Nothing on the page can be reached with Tab." };
  let wrapped = false;
  const seen = new Set<Element>();
  for (let n = 0; n < o.steps; n++) {
    const current = doc.activeElement && doc.activeElement !== doc.body ? stops.indexOf(doc.activeElement) : -1;
    let target: Element | undefined;
    const to = n === 0 ? o.to : "next";
    if (typeof to === "object") target = to.element;
    else if (to === "first") target = stops[0];
    else if (to === "last") target = stops[stops.length - 1];
    else if (to === "next") {
      if (current >= stops.length - 1) wrapped = true;
      target = stops[(current + 1) % stops.length];
    } else {
      if (current <= 0) wrapped = true;
      target = stops[current <= 0 ? stops.length - 1 : current - 1];
    }
    if (!target) break;
    (target as HTMLElement).focus({ preventScroll: false });
    if (doc.activeElement !== target) {
      trapped = `Focus did not move to ${target.tagName.toLowerCase()}${nameOf(target) ? ` "${nameOf(target)}"` : ""}: something else holds it (${doc.activeElement?.tagName.toLowerCase() ?? "nothing"}).`;
      break;
    }
    if (o.steps > 1 && seen.has(target) && seen.size < stops.length && typeof o.to === "string" && o.to !== "prev") {
      trapped = `Focus came back to ${target.tagName.toLowerCase()} after ${seen.size} of ${stops.length} stops: it cycles without reaching the rest.`;
      break;
    }
    seen.add(target);
    visited.push({
      index: stops.indexOf(target) + 1,
      tag: target.tagName.toLowerCase(),
      role: roleOf(target),
      name: nameOf(target),
      indicator: hasFocusIndicator(target as HTMLElement),
      node: o.nodeOf(target),
    });
  }
  return { visited, stops: stops.length, trapped, wrapped, note: "Focus is moved by script, one stop at a time, in the order Tab uses." };
}
