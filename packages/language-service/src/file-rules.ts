// Rules that look at source structure rather than template expression types: lazy() use,
// router link imports, module-level state, constructors, class fragments and tsconfig.
// Each rule reports through `report(start, length, rule, message)` in the file it was given.

import ts from "@typescript/typescript6";
import type { RuleId } from "./config.js";
import type { TemplateModel } from "./emit.js";
import type { ElementNode, TNode } from "./scan.js";
import { literalSelector, metaObject, metaProperty, unwrap } from "./typeutil.js";

export type Report = (start: number, length: number, rule: RuleId, message: string) => void;

/** Visits every element with whether it sits in a `@defer` body (where `lazy()` components are loaded). */
function walkElements(tree: TNode[], visit: (el: ElementNode, inDefer: boolean) => void, inDefer = false): void {
  for (const node of tree) {
    switch (node.type) {
      case "element":
        visit(node, inDefer);
        walkElements(node.children, visit, inDefer);
        break;
      case "if":
        for (const b of node.branches) walkElements(b.children, visit, inDefer);
        break;
      case "for":
        walkElements(node.children, visit, inDefer);
        if (node.empty) walkElements(node.empty, visit, inDefer);
        break;
      case "switch":
        for (const c of node.cases) walkElements(c.children, visit, inDefer);
        break;
      case "defer":
        walkElements(node.children, visit, true);
        for (const section of [node.placeholder, node.loading, node.error]) if (section) walkElements(section, visit, inDefer);
        break;
    }
  }
}

/** The `meta.imports` elements of a class. */
function importEntries(cls: ts.ClassDeclaration): ts.Expression[] {
  const meta = metaObject(cls);
  const imports = meta && metaProperty(meta, "imports");
  const list = imports && unwrap(imports);
  return list && ts.isArrayLiteralExpression(list) ? list.elements.map(unwrap) : [];
}

/** `lazy(() => import("./x.js"), "Name")` entries with the selector of the component they load, when it can be resolved. */
function lazyEntries(cls: ts.ClassDeclaration, checker: ts.TypeChecker): Array<{ name: string; selector?: string }> {
  const out: Array<{ name: string; selector?: string }> = [];
  for (const entry of importEntries(cls)) {
    if (!ts.isCallExpression(entry) || !ts.isIdentifier(entry.expression) || entry.expression.text !== "lazy") continue;
    const [loader, name] = entry.arguments;
    if (!name || !ts.isStringLiteralLike(name) || !loader) continue;
    const body = ts.isArrowFunction(loader) || ts.isFunctionExpression(loader) ? loader.body : undefined;
    const call = body && (ts.isBlock(body) ? undefined : unwrap(body));
    let selector: string | undefined;
    if (call) {
      const promise = checker.getTypeAtLocation(call);
      const module = checker.getTypeArguments(promise as ts.TypeReference)[0];
      const decl = module && checker.getTypeOfSymbol(module.getProperty(name.text) ?? ({} as ts.Symbol)).symbol?.declarations?.find(ts.isClassDeclaration);
      selector = decl && literalSelector(decl);
    }
    out.push({ name: name.text, selector });
  }
  return out;
}

/** Whether the class's `meta.imports` lists a component or directive with this literal selector. */
function importsSelector(cls: ts.ClassDeclaration, checker: ts.TypeChecker, selector: string): boolean {
  return importEntries(cls).some((entry) => {
    let symbol = checker.getSymbolAtLocation(entry);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const decl = symbol?.declarations?.find(ts.isClassDeclaration);
    return !!decl && literalSelector(decl) === selector;
  });
}

const LINK_DIRECTIVES = ["routerLink", "routerLinkActive"];

export function templateRules(model: TemplateModel, checker: ts.TypeChecker, report: Report): void {
  const imported = new Map<string, boolean>();
  walkElements(model.tree, (el) => {
    const uses = [...el.attrs.map((a) => ({ name: a.name, at: a.nameStart })), ...el.expressions.filter((x) => x.kind === "value").map((x) => ({ name: x.name, at: x.nameStart }))];
    for (const { name, at } of uses) {
      if (!LINK_DIRECTIVES.includes(name)) continue;
      const selector = `[${name}]`;
      if (!imported.has(selector)) imported.set(selector, importsSelector(model.classNode, checker, selector));
      if (!imported.get(selector)) {
        const cls = name[0]!.toUpperCase() + name.slice(1);
        report(at, name.length, "router-link-import", `${name} is not imported in ${model.className}: add ${cls} (from @gable/core/router) to meta.imports`);
      }
    }
  });
  const lazies = lazyEntries(model.classNode, checker);
  if (lazies.length) {
    walkElements(model.tree, (el, inDefer) => {
      const lazy = lazies.find((l) => l.selector === el.tag);
      if (lazy && !inDefer) report(el.tagStart, el.tag.length, "lazy-outside-defer", `<${el.tag}> is a lazy() import (${lazy.name}) and can only be used inside @defer`);
    });
  }
}
