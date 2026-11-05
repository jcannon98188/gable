import { doc as prettierDoc, type AstPath, type Doc, type ParserOptions, type Plugin, type Printer } from "prettier";
import { parsers as babelParsers } from "prettier/plugins/babel";
import { printers as estreePrinters } from "prettier/plugins/estree";
import { parsers as tsParsers } from "prettier/plugins/typescript";
import { formatTemplate } from "@gable/template-format";

const { hardline, indent, join } = prettierDoc.builders;

/** Template literals use this tag; matches the analyzer's default (`html`). */
const TAG = "html";

// Node types whose children are printed one indent level deeper. Used only to estimate the width budget.
const INDENTING = new Set([
  "ClassBody",
  "BlockStatement",
  "StaticBlock",
  "ObjectExpression",
  "ArrayExpression",
  "TSModuleBlock",
  "TSInterfaceBody",
  "TSTypeLiteral",
]);

function isHtmlLiteral(path: AstPath): boolean {
  const node = path.node as { type?: string };
  const parent = path.parent as { type?: string; tag?: { type?: string; name?: string } } | null;
  return (
    node?.type === "TemplateLiteral" &&
    parent?.type === "TaggedTemplateExpression" &&
    parent.tag?.type === "Identifier" &&
    parent.tag.name === TAG
  );
}

function depthOf(path: AstPath): number {
  let depth = 0;
  for (let n = 0; ; n++) {
    const a = path.getParentNode(n) as { type?: string } | null;
    if (!a) return depth;
    if (a.type && INDENTING.has(a.type)) depth++;
  }
}

function printHtmlLiteral(path: AstPath, options: ParserOptions, print: (p: AstPath) => Doc): Doc {
  const node = path.node as { quasis: { value: { raw: string } }[] };
  const holes = path.map(print, "expressions").map(
    (d) => "${" + prettierDoc.printer.printDocToString(d, { ...options, printWidth: Infinity }).formatted + "}",
  );
  let body = "";
  node.quasis.forEach((q, n) => {
    body += q.value.raw + (holes[n] ?? "");
  });
  const base = { indentSize: options.tabWidth, useTabs: options.useTabs };
  const flat = formatTemplate(body, { ...base, printWidth: Infinity });
  if (flat === "") return "``";
  if (!body.includes("\n") && !flat.includes("\n")) return "`" + flat + "`";
  const budget = options.printWidth - (depthOf(path) + 1) * options.tabWidth;
  const lines = formatTemplate(body, { ...base, printWidth: Math.max(budget, 20) }).split("\n");
  return ["`", indent([hardline, join(hardline, lines)]), hardline, "`"];
}

const estree = estreePrinters["estree"] as Printer;

const printer: Printer = {
  ...estree,
  print(path, options, print, args) {
    if (isHtmlLiteral(path)) return printHtmlLiteral(path, options, print as (p: AstPath) => Doc);
    return estree.print(path, options, print, args);
  },
  // Stop Prettier's built-in html embedding from touching html literals; keep css/graphql/markdown embeds.
  embed: ((path, options) =>
    isHtmlLiteral(path) ? undefined : (estree.embed as NonNullable<Printer["embed"]>)(path, options)) as Printer["embed"],
};

const withPrinter = <T extends { astFormat: string }>(p: T): T => ({ ...p, astFormat: "gable-estree" });

export const parsers: Plugin["parsers"] = {
  typescript: withPrinter(tsParsers["typescript"] as never),
  babel: withPrinter(babelParsers["babel"] as never),
  "babel-ts": withPrinter(babelParsers["babel-ts"] as never),
};

export const printers: Plugin["printers"] = { "gable-estree": printer };
