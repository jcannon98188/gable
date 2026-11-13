import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import { buildElementMap, propTypeText, SCENE_EVENTS, SCENE_TAGS, SHAPE_TAGS, HIT_TAGS, propertiesOf, type HitTagName, type SceneTagName, type ShapeTagName } from "@gable/renderer-pixi/elements";
import { describe, expect, it } from "vitest";
import { sceneDeclarations, sceneEventNames, scenePropType, scenePropertyNames, sceneTagNames } from "./scene.js";

// The element map the language service types scene templates against comes from one place: the shared
// tag and property table of @gable/renderer-pixi/elements (TASK-104.7). These tests tie the two together
// and then type-check the emitted declarations against Pixi's own types, so a table entry that drifts from
// the map, or a map type Pixi would not accept, fails here.

const tags = [...Object.keys(SCENE_TAGS), ...Object.keys(SHAPE_TAGS), ...Object.keys(HIT_TAGS)] as Array<SceneTagName | ShapeTagName | HitTagName>;
const sceneTags = Object.keys(SCENE_TAGS) as SceneTagName[];
const events = Object.keys(SCENE_EVENTS);

// Table properties that are Gable conventions rather than fields of the Pixi object (as in the renderer's own conformance test).
const GABLE_ONLY = new Set(["fill", "stroke", "strokeWidth", "text", "context", "a11y", "dynamicProperties"]);
const TEXT_STYLE = new Set(["fontSize", "fontFamily", "fontWeight", "fontStyle", "fill", "align", "wordWrap", "wordWrapWidth", "letterSpacing", "stroke", "lineHeight"]);

describe("the element map is the shared table", () => {
  const map = buildElementMap();

  it("has an entry for every table tag and nothing else", () => {
    expect(Object.keys(map).sort()).toEqual([...tags].sort());
    expect(sceneTagNames().sort()).toEqual([...tags].sort());
  });

  it.each(tags)("%s: the properties and their types are the table's", (tag) => {
    const table = propertiesOf(tag);
    expect(Object.keys(map[tag].props).sort()).toEqual(Object.keys(table).sort());
    for (const [name, spec] of Object.entries(table)) {
      const expected = propTypeText(spec);
      expect(map[tag].props[name], `${tag}.${name}`).toBe(expected);
    }
  });

  it("types every event as the table's event class and offers them all to the editor", () => {
    expect(sceneEventNames().sort()).toEqual([...events].sort());
    for (const tag of sceneTags) expect(map[tag].events).toEqual(SCENE_EVENTS);
  });

  it("allows dotted axes only on the point-like properties, typed number", () => {
    for (const tag of tags) {
      const offered = scenePropertyNames(tag);
      for (const [name, spec] of Object.entries(propertiesOf(tag))) {
        expect(scenePropType(tag, `${name}.x`) === "number", `${tag}.${name}.x`).toBe(spec.kind === "point");
        expect(scenePropType(tag, `${name}.z`), `${tag}.${name}.z`).toBeUndefined();
        expect(offered.includes(`${name}.y`), `${tag} offers ${name}.y`).toBe(spec.kind === "point");
      }
    }
  });
});

describe("the emitted map type-checks against Pixi's own types", () => {
  // Resolve pixi.js from a fixture project, like a real scene project does.
  const file = `${fileURLToPath(new URL("../fixtures/scene-pass/src/", import.meta.url)).replace(/\\/g, "/")}__conformance.ts`;
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true, types: [], lib: ["lib.es2022.d.ts", "lib.dom.d.ts"] };
  const preamble = `import "pixi.js/events";\ntype __Out<T> = any;\n${sceneDeclarations()}\n`;

  function compile(body: string) {
    const text = `${preamble}${body}\nexport {};\n`;
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (f, ...rest) => (f.replace(/\\/g, "/") === file ? ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true) : getSourceFile(f, ...rest));
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (f) => f.replace(/\\/g, "/") === file || fileExists(f);
    const program = ts.createProgram({ rootNames: [file], options, host });
    const sf = program.getSourceFile(file)!;
    return { program, sf, errors: ts.getPreEmitDiagnostics(program, sf).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")) };
  }

  it("resolves every node class from pixi.js", () => {
    expect(compile("").errors).toEqual([]);
  });

  it("types each event as exactly the event Pixi emits under that name", () => {
    const body = events.map((e) => `declare const __e_${e}: [import("pixi.js").AllFederatedEventMap[${JSON.stringify(e)}], __ScEvMap[${JSON.stringify(e)}]];\nconst __f_${e}: [__ScEvMap[${JSON.stringify(e)}], import("pixi.js").AllFederatedEventMap[${JSON.stringify(e)}]] = __e_${e};`).join("\n");
    expect(compile(body).errors).toEqual([]);
  });

  it("accepts every property value the table allows on the Pixi node that declares it", () => {
    // Which table properties does each node class declare? Ask the checker, then write the map's type into those.
    const probe = compile(tags.map((tag, i) => `type __N${i} = __ScNodes[${JSON.stringify(tag)}];`).join("\n"));
    const checker = probe.program.getTypeChecker();
    const declared = tags.map((_, i) => {
      const alias = probe.sf.statements.find((st): st is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(st) && st.name.text === `__N${i}`)!;
      const node = checker.getTypeAtLocation(alias.name);
      return new Set(checker.getPropertiesOfType(node).map((p) => p.name));
    });
    const body: string[] = [];
    const undeclared: string[] = [];
    tags.forEach((tag, i) => {
      for (const name of Object.keys(propertiesOf(tag))) {
        if (declared[i]!.has(name)) {
          const spec = propertiesOf(tag)[name]!;
          const kind = spec.kind;
          const id = `${i}_${name}`;
          const key = JSON.stringify(name);
          const node = `declare let __o_${id}: __ScNodes[${JSON.stringify(tag)}];`;
          // A point accepts a bare number as a Gable convention (uniform scale); Pixi's setters take the {x, y} half.
          if (kind === "point") body.push(`${node}\n__o_${id}[${key}] = null as unknown as { x: number; y: number };`);
          // An open string property is looser than Pixi's literal unions: what Pixi holds must fit the map's type. A closed one (eventMode, cursor) is a subset: its values must fit Pixi's.
          else if (kind === "string" && !spec.values) body.push(`${node}\nconst __r_${id}: ${scenePropType(tag, name)} = null as unknown as NonNullable<(typeof __o_${id})[${key}]>;`);
          else body.push(`${node}\ndeclare const __w_${id}: ${scenePropType(tag, name)};\n__o_${id}[${key}] = __w_${id};`);
        } else if (!GABLE_ONLY.has(name) && !(TEXT_STYLE.has(name) && (tag === "text" || tag === "bitmap-text"))) undeclared.push(`${tag}.${name}`);
      }
    });
    expect(undeclared, "table properties neither on the Pixi node nor a known Gable convention").toEqual([]);
    expect(body.length).toBeGreaterThan(100);
    expect(compile(body.join("\n")).errors).toEqual([]);
  });
});
