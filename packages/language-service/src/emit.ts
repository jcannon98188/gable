// Type-check block generation. A template becomes a function whose `__c` parameter
// is the component instance; each template expression becomes a TypeScript
// expression inside it (scope variables become real locals, so TS narrows them).
// The blocks are appended to the source file's own text, so they see its imports
// and un-exported classes, and original offsets are unchanged. Every emitted
// character that came from the template is recorded as a mapped `Part`.

import type ts from "@typescript/typescript6";
import type { RuleId } from "./config.js";
import type { ElementNode, ExprKind, Src, TNode } from "./scan.js";
import { childScene, knownSceneTag, sceneDeclarations, scenePropType, walkMode } from "./scene.js";

/** A run of generated text; `src` is the template offset it was copied from, when it was copied. */
export interface Part {
  text: string;
  src?: number;
  /** Offset in the generated file (set by layout). */
  gen: number;
}

export interface Group {
  kind: ExprKind | "hole";
  /** The rule a type error in this group is reported as, when it is not the generic one. */
  rule?: RuleId;
  parts: Part[];
  srcStart: number;
  srcEnd: number;
  refs: Ref[];
  genStart: number;
  genEnd: number;
}

/** One property-path step (`count`, `.name`) in a template expression. */
export interface Ref {
  ordinal: number;
  /** The identifier part. */
  part: Part;
  group: Group;
  /** Where the path chain began (the part to wrap when this step is an Observable/Promise). */
  chainStart: Part;
  srcStart: number;
  srcEnd: number;
}

/** A declaration emitted only so the checker can be asked about its type. */
export interface Probe {
  text: string;
  gen: number;
}

/** An `(event)` binding whose name is validated against the element's DOM events and the component's outputs. */
export interface EventSite {
  name: string;
  nameStart: number;
  tag: string;
  /** The DOM event map of the element (the scene event map on a scene element). */
  dom: Probe;
  /** A known scene tag: the event names are checked against the scene event map. */
  scene?: boolean;
  /** The component instance type, when the tag is a known component. */
  component?: Probe;
  /** The element carries a camelCase attribute (`uiDrawerDrag`, `[uiSortable]`): an attribute directive whose outputs are not known here. */
  directive?: boolean;
}

/** An element with `[field]` whose component must expose a `value` model. */
export interface ControlSite {
  tag: string;
  tagStart: number;
  component: Probe;
}

/** A `@for` over `rows()`: the item's type tells whether it is a form row, and the track expression whether it is keyed. */
export interface RowLoop {
  track: Src;
  item: string;
  probe: Probe;
}

export type Item = string | Group | Probe;

/** The `@for` a value expression sits inside. */
export interface LoopInfo {
  item: string;
  source: Src;
  track: Src;
  /** The first path step of the (valid) source expression, for asking the checker about it. */
  sourceRef?: Ref;
}

/** A value expression the quick fixes may extract, with the scope it was written in. */
export interface Site {
  expr: Src;
  locals: ReadonlySet<string>;
  /** The innermost enclosing `@for`, when the expression is in its body. */
  loop?: LoopInfo;
  model: TemplateModel;
  /** The binding target the expression feeds (`aria-expanded`, `disabled`), for naming an extracted signal; absent in text. */
  hint?: string;
}

export interface TemplateModel {
  className: string;
  /** The class whose `static meta` holds this template. */
  classNode: ts.ClassDeclaration;
  /** Where quick fixes insert new class members (end of the last member, so field initializers run after the fields they read), and that line's indentation. */
  insertAt: number;
  indent: string;
  tree: TNode[];
  /** The template is typed against the Pixi element map (a renderer boundary or a marked scene component). */
  scene: boolean;
  /** `${}` hole expressions, checked as plain TypeScript. */
  holes: Src[];
}

export interface Emitted {
  /** The text appended to the original source. */
  text: string;
  groups: Group[];
  refs: Ref[];
  events: EventSite[];
  sites: Site[];
  controls: ControlSite[];
  rowLoops: RowLoop[];
  /** The map of known element tags (a probe), for telling native tags from custom ones. */
  tags: Probe;
}

const HELPERS = `
declare function __rd<T>(v: T): T extends import("rxjs").Observable<infer U> ? U | undefined : T extends PromiseLike<infer U> ? U | undefined : T;
declare function __isf(f: { (): unknown; set(v: never): void; state: { markTouched(): void } }): void;
declare function __fld<C>(f: { (): C }): void;
type __Val<S> = S extends { (): infer T } ? T : any;
declare function __link(v: string | readonly unknown[]): void;
declare function __iter<T>(v: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T>;
declare function __w<P>(v: { (): P; set(value: P): void }): void;
type __El<T extends string> = T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : HTMLElement;
type __EvMap<E> = E extends HTMLBodyElement ? HTMLBodyElementEventMap : E extends HTMLMediaElement ? HTMLMediaElementEventMap : HTMLElementEventMap;
type __Out<T> = T extends import("rxjs").Observable<infer U> ? U : any;
type __Ev<C, E, N extends string> = N extends keyof C ? __Out<C[N]> : N extends keyof __EvMap<E> ? __EvMap<E>[N] & { readonly currentTarget: E } : any;
type __Prop<C, E, N extends string> = N extends keyof C ? (C[N] extends { (): infer T } ? T : any) : N extends keyof E ? E[N] : any;
`;

const LITERALS = new Set(["true", "false", "null", "undefined"]);
const LOOP_VARS = ["$index", "$first", "$last", "$count", "$even", "$odd"];
const TOKEN = /\s+|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\?\?|\?\.|[\s\S]/y;

/** Whether any element of the template is typed against the scene map. */
function hasScene(t: TemplateModel, isBoundary: (tag: string) => boolean): boolean {
  let found = false;
  walkMode(t.tree, t.scene, isBoundary, (_el, scene) => {
    if (scene) found = true;
  });
  return found;
}

const DIRECTIVE_ATTR = /^[a-z][a-z0-9]*[A-Z]/;
/** An attribute directive is applied by a camelCase attribute; its outputs cannot be resolved from the tag. */
const hasDirective = (node: { attrs: Array<{ name: string }>; expressions: Array<{ kind: string; name: string }> }): boolean =>
  node.attrs.some((a) => DIRECTIVE_ATTR.test(a.name)) || node.expressions.some((x) => x.kind !== "handler" && DIRECTIVE_ATTR.test(x.name));

/**
 * Generates the check blocks. `observed` holds ordinals of path steps that are
 * Observables/Promises (found by a first pass); they are unwrapped to `T | undefined`
 * and every later step in that path becomes `?.`. `isValid` filters out expressions
 * the shared parser rejected.
 */
export function emit(
  templates: TemplateModel[],
  observed: ReadonlySet<number>,
  isValid: (e: Src, kind: ExprKind) => boolean,
  originalLength: number,
  /** The TypeScript type reference for the component class a tag selects, if the tag is a component. */
  componentType: (tag: string) => string | undefined = () => undefined,
  /** Whether a tag selects a component that declares a renderer boundary (its children are scene elements). */
  isBoundary: (tag: string) => boolean = () => false,
): Emitted {
  const items: Item[] = [HELPERS];
  if (templates.some((t) => t.scene) || templates.some((t) => hasScene(t, isBoundary))) items.push(sceneDeclarations());
  const groups: Group[] = [];
  const refs: Ref[] = [];
  const events: EventSite[] = [];
  const sites: Site[] = [];
  const controls: ControlSite[] = [];
  const rowLoops: RowLoop[] = [];
  let model!: TemplateModel;
  let loop: LoopInfo | undefined;
  const push = (s: string) => items.push(s);
  const probe = (text: string): Probe => {
    const p: Probe = { text, gen: 0 };
    items.push(p);
    return p;
  };
  const tags = probe("declare const __tags: HTMLElementTagNameMap;\n");
  const instanceType = (tag: string) => componentType(tag) ?? "{}";
  /** What a `[field]` writes into and reads from this element: native controls by type, custom ones by their `value` model. */
  const controlType = (node: ElementNode): string => {
    const comp = componentType(node.tag);
    if (comp) return `__Val<${comp} extends { value: infer V } ? V : any>`;
    const type = node.attrs.find((a) => a.name === "type")?.value;
    if (node.tag === "input" && (type === "number" || type === "range")) return "number | null | undefined";
    if (node.tag === "input" && type === "checkbox") return "boolean";
    if (node.tag === "textarea" || (node.tag === "input" && type !== "radio")) return "string | null | undefined";
    return "unknown";
  };

  function expression(e: Src, kind: Group["kind"], locals: ReadonlySet<string>, open: string, close: string, extractable = true, rule?: RuleId, hint?: string): void {
    if (kind === "value" && extractable) sites.push({ expr: e, locals, loop, model, hint });
    if (kind !== "hole" && !isValid(e, kind as ExprKind)) return;
    const group: Group = { kind, rule, parts: [], srcStart: e.start, srcEnd: e.start + e.text.length, refs: [], genStart: 0, genEnd: 0 };
    const add = (text: string, src?: number): Part => {
      const part: Part = { text, src, gen: 0 };
      group.parts.push(part);
      return part;
    };
    if (kind === "hole") add(e.text, e.start);
    else {
      let prevSig: string | null = null;
      let chainStart: Part | null = null;
      let optional = false;
      TOKEN.lastIndex = 0;
      while (TOKEN.lastIndex < e.text.length) {
        const at = TOKEN.lastIndex;
        const tok = TOKEN.exec(e.text)![0];
        const src = e.start + at;
        if (/^\s/.test(tok)) {
          add(tok, src);
          continue;
        }
        if (/^[A-Za-z_$]/.test(tok) && !LITERALS.has(tok)) {
          const member = prevSig === "." || prevSig === "?.";
          let first: Part | undefined;
          if (!member && !locals.has(tok)) first = add("__c.");
          const part = add(tok, src);
          if (!member) {
            chainStart = first ?? part;
            optional = false;
          }
          const ref: Ref = { ordinal: refs.length, part, group, chainStart: chainStart ?? part, srcStart: src, srcEnd: src + tok.length };
          refs.push(ref);
          group.refs.push(ref);
          if (observed.has(ref.ordinal)) {
            group.parts.splice(group.parts.indexOf(ref.chainStart), 0, { text: "__rd(", gen: 0 });
            add(")");
            optional = true;
          }
        } else if (tok === "." && optional) add("?.", src);
        else add(tok, src);
        prevSig = tok;
      }
    }
    push(open);
    items.push(group);
    push(close);
    groups.push(group);
  }

  function nodes(list: TNode[], outer: ReadonlySet<string>, scene: boolean): void {
    const locals = new Set(outer);
    for (const node of list) {
      switch (node.type) {
        case "text":
          for (const e of node.exprs) expression(e, "value", locals, "void (", ");\n");
          break;
        case "let":
          expression(node.expr, "value", locals, `const ${node.name} = (`, ");\n");
          locals.add(node.name);
          break;
        case "element": {
          // A known scene tag is typed by the element map; a component host in a scene is a container with the scene events.
          const typed = scene && knownSceneTag(node.tag) && !componentType(node.tag);
          const El = scene ? "__ScEl" : "__El";
          for (const name of node.refs) {
            push(`const ${name}: ${El}<${JSON.stringify(node.tag)}> = undefined as any;\n`);
            locals.add(name);
          }
          for (const e of node.expressions) {
            const tag = JSON.stringify(node.tag);
            if (e.kind === "handler") {
              const inner = new Set(locals).add("$event");
              const n = events.length;
              const dom = probe(`declare const __evd_${n}: ${scene ? "__ScEvMap" : `__EvMap<__El<${tag}>>`};\n`);
              const comp = componentType(node.tag);
              const component = comp ? probe(`declare const __evc_${n}: ${comp};\n`) : undefined;
              events.push({ name: e.name, nameStart: e.nameStart, tag: node.tag, dom, component, directive: !scene && hasDirective(node), scene: typed });
              const eventType = scene ? `__SEv<${instanceType(node.tag)}, ${JSON.stringify(e.name)}>` : `__Ev<${instanceType(node.tag)}, __El<${tag}>, ${JSON.stringify(e.name)}>`;
              push(`{ const $event: ${eventType} = undefined as any; `);
              expression(e, "handler", inner, "", ";");
              push(" }\n");
            } else if (e.kind === "field") {
              expression(e, "field", locals, "__isf(", ");\n", false, "field-not-a-field");
              expression(e, "field", locals, `__fld<${controlType(node)}>(`, ");\n", false, "field-value-mismatch");
              const comp = componentType(node.tag);
              if (comp) controls.push({ tag: node.tag, tagStart: node.tagStart, component: probe(`declare const __cc_${controls.length}: ${comp};\n`) });
            } else if (e.kind === "model") expression(e, "model", locals, `__w<__Prop<${instanceType(node.tag)}, ${El}<${tag}>, ${JSON.stringify(e.name)}>>(`, ");\n");
            else if (e.name === "routerLink") expression(e, "value", locals, "__link(", ");\n", true, "router-link-type");
            else {
              const type = typed ? scenePropType(node.tag, e.name) : undefined;
              if (type) expression(e, "value", locals, `__sv<${type}>(`, ");\n", true, undefined, e.name);
              else expression(e, "value", locals, "void (", ");\n", true, undefined, e.name);
            }
          }
          push("{\n");
          nodes(node.children, locals, childScene(node, scene, isBoundary));
          push("}\n");
          break;
        }
        case "if": {
          const branch = (i: number): void => {
            const b = node.branches[i]!;
            const inner = new Set(locals);
            if (b.cond) {
              if (b.alias) {
                push("{ ");
                expression(b.cond, "value", locals, `const ${b.alias} = (`, ");\n");
                inner.add(b.alias);
                push(`if (${b.alias}) {\n`);
              } else expression(b.cond, "value", locals, "if (", ") {\n");
              nodes(b.children, inner, scene);
              push("}");
              if (i + 1 < node.branches.length) {
                push(" else {\n");
                branch(i + 1);
                push("}");
              }
              if (b.alias) push(" }");
              push("\n");
            } else {
              nodes(b.children, inner, scene);
            }
          };
          branch(0);
          break;
        }
        case "for": {
          const inner = new Set(locals).add(node.item);
          for (const v of LOOP_VARS) inner.add(v);
          const outerLoop = loop;
          const first = refs.length;
          expression(node.source, "value", locals, `for (const ${node.item} of __iter(`, ")) {\n");
          const info: LoopInfo = { item: node.item, source: node.source, track: node.track, sourceRef: refs[first] };
          push("const $index: number = 0, $count: number = 0; const $first: boolean = false, $last: boolean = false, $even: boolean = false, $odd: boolean = false;\n");
          if (/(^|\.)rows\(\)$/.test(node.source.text)) {
            rowLoops.push({ track: node.track, item: node.item, probe: probe(`declare const __rl_${rowLoops.length}: typeof ${node.item};\n`) });
          }
          expression(node.track, "value", inner, "void (", ");\n", false);
          loop = info;
          nodes(node.children, inner, scene);
          loop = outerLoop;
          push("}\n");
          if (node.empty) {
            push("{\n");
            nodes(node.empty, locals, scene);
            push("}\n");
          }
          break;
        }
        case "defer": {
          if (node.when) expression(node.when, "value", locals, "void (", ");\n");
          for (const body of [node.children, node.placeholder, node.loading, node.error]) {
            if (!body) continue;
            push("{\n");
            nodes(body, locals, scene);
            push("}\n");
          }
          break;
        }
        case "switch": {
          expression(node.expr, "value", locals, "switch (", ") {\n");
          for (const c of node.cases) {
            if (c.expr) expression(c.expr, "value", locals, "case ", ": {\n");
            else push("default: {\n");
            nodes(c.children, locals, scene);
            push("break; }\n");
          }
          push("}\n");
          break;
        }
      }
    }
  }

  templates.forEach((t, n) => {
    model = t;
    push(`function __gable_check_${n}(__c: ${t.className}) {\n`);
    for (const hole of t.holes) expression(hole, "hole", new Set(), "void (", ");\n");
    nodes(t.tree, new Set(), t.scene);
    push("}\n");
  });

  // Layout: assign generated offsets.
  let text = "\n";
  let offset = originalLength + 1;
  const place = (s: string) => {
    text += s;
    offset += s.length;
  };
  for (const item of items) {
    if (typeof item === "string") place(item);
    else if (!("parts" in item)) {
      item.gen = offset;
      place(item.text);
    } else {
      item.genStart = offset;
      for (const part of item.parts) {
        part.gen = offset;
        place(part.text);
      }
      item.genEnd = offset;
    }
  }
  return { text, groups, refs, events, sites, controls, rowLoops, tags };
}
