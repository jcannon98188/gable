// Type-check block generation. A template becomes a function whose `__c` parameter
// is the component instance; each template expression becomes a TypeScript
// expression inside it (scope variables become real locals, so TS narrows them).
// The blocks are appended to the source file's own text, so they see its imports
// and un-exported classes, and original offsets are unchanged. Every emitted
// character that came from the template is recorded as a mapped `Part`.

import type ts from "@typescript/typescript6";
import type { RuleId } from "./config.js";
import type { ExprKind, Src, TNode } from "./scan.js";

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
  /** The DOM event map of the element. */
  dom: Probe;
  /** The component instance type, when the tag is a known component. */
  component?: Probe;
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
}

export interface TemplateModel {
  className: string;
  /** The class whose `static meta` holds this template. */
  classNode: ts.ClassDeclaration;
  /** Where quick fixes insert new class members (end of the last member, so field initializers run after the fields they read), and that line's indentation. */
  insertAt: number;
  indent: string;
  tree: TNode[];
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
  /** The map of known element tags (a probe), for telling native tags from custom ones. */
  tags: Probe;
}

const HELPERS = `
declare function __rd<T>(v: T): T extends import("rxjs").Observable<infer U> ? U | undefined : T extends PromiseLike<infer U> ? U | undefined : T;
declare function __link(v: string | readonly unknown[]): void;
declare function __iter<T>(v: Iterable<T> | ArrayLike<T> | null | undefined): Iterable<T>;
declare function __w<P>(v: { (): P; set(value: P): void }): void;
type __El<T extends string> = T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T] : HTMLElement;
type __EvMap<E> = E extends HTMLBodyElement ? HTMLBodyElementEventMap : E extends HTMLMediaElement ? HTMLMediaElementEventMap : HTMLElementEventMap;
type __Out<T> = T extends import("rxjs").Observable<infer U> ? U : any;
type __Ev<C, E, N extends string> = N extends keyof C ? __Out<C[N]> : N extends keyof __EvMap<E> ? __EvMap<E>[N] : any;
type __Prop<C, E, N extends string> = N extends keyof C ? (C[N] extends { (): infer T } ? T : any) : N extends keyof E ? E[N] : any;
`;

const LITERALS = new Set(["true", "false", "null", "undefined"]);
const LOOP_VARS = ["$index", "$first", "$last", "$count", "$even", "$odd"];
const TOKEN = /\s+|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\?\?|\?\.|[\s\S]/y;

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
): Emitted {
  const items: Item[] = [HELPERS];
  const groups: Group[] = [];
  const refs: Ref[] = [];
  const events: EventSite[] = [];
  const sites: Site[] = [];
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

  function expression(e: Src, kind: Group["kind"], locals: ReadonlySet<string>, open: string, close: string, extractable = true, rule?: RuleId): void {
    if (kind === "value" && extractable) sites.push({ expr: e, locals, loop, model });
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

  function nodes(list: TNode[], outer: ReadonlySet<string>): void {
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
          for (const name of node.refs) {
            push(`const ${name}: __El<${JSON.stringify(node.tag)}> = undefined as any;\n`);
            locals.add(name);
          }
          for (const e of node.expressions) {
            const tag = JSON.stringify(node.tag);
            if (e.kind === "handler") {
              const inner = new Set(locals).add("$event");
              const n = events.length;
              const dom = probe(`declare const __evd_${n}: __EvMap<__El<${tag}>>;\n`);
              const comp = componentType(node.tag);
              const component = comp ? probe(`declare const __evc_${n}: ${comp};\n`) : undefined;
              events.push({ name: e.name, nameStart: e.nameStart, tag: node.tag, dom, component });
              push(`{ const $event: __Ev<${instanceType(node.tag)}, __El<${tag}>, ${JSON.stringify(e.name)}> = undefined as any; `);
              expression(e, "handler", inner, "", ";");
              push(" }\n");
            } else if (e.kind === "model") expression(e, "model", locals, `__w<__Prop<${instanceType(node.tag)}, __El<${tag}>, ${JSON.stringify(e.name)}>>(`, ");\n");
            else if (e.name === "routerLink") expression(e, "value", locals, "__link(", ");\n", true, "router-link-type");
            else expression(e, "value", locals, "void (", ");\n");
          }
          push("{\n");
          nodes(node.children, locals);
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
              nodes(b.children, inner);
              push("}");
              if (i + 1 < node.branches.length) {
                push(" else {\n");
                branch(i + 1);
                push("}");
              }
              if (b.alias) push(" }");
              push("\n");
            } else {
              nodes(b.children, inner);
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
          expression(node.track, "value", inner, "void (", ");\n", false);
          loop = info;
          nodes(node.children, inner);
          loop = outerLoop;
          push("}\n");
          if (node.empty) {
            push("{\n");
            nodes(node.empty, locals);
            push("}\n");
          }
          break;
        }
        case "defer": {
          if (node.when) expression(node.when, "value", locals, "void (", ");\n");
          for (const body of [node.children, node.placeholder, node.loading, node.error]) {
            if (!body) continue;
            push("{\n");
            nodes(body, locals);
            push("}\n");
          }
          break;
        }
        case "switch": {
          expression(node.expr, "value", locals, "switch (", ") {\n");
          for (const c of node.cases) {
            if (c.expr) expression(c.expr, "value", locals, "case ", ": {\n");
            else push("default: {\n");
            nodes(c.children, locals);
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
    nodes(t.tree, new Set());
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
  return { text, groups, refs, events, sites, tags };
}
