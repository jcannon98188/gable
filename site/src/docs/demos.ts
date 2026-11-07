import type { ComponentClass } from "@gable/core";

/** One live demo a markdown page can embed with a ```` ```demo <name> ```` fence. */
export interface DemoEntry {
  title: string;
  /** One sentence shown under the title. */
  description: string;
  /** Fetches the demo's chunk and returns its component class. Only called when a page showing the demo is viewed. */
  load: () => Promise<ComponentClass>;
  /** The demo's real source file (raw text), shown under the live demo. */
  source: () => Promise<string>;
}

type Loader = () => Promise<string>;
// Lazy raw sources of every demo file (tests excluded); each is its own chunk, fetched only when a frame opens.
const RAW = import.meta.glob(["../demos/**/*.ts", "!../demos/**/*.test.ts"], { query: "?raw", import: "default" }) as Record<string, Loader>;

/**
 * Describes a demo. `file` is the demo's source path relative to `site/src/demos/` (for example
 * `"signals/signals-demo.ts"`); it is shown verbatim next to the live demo, so keep each demo self-explanatory.
 */
export function defineDemo(spec: { title: string; description: string; file: string; load: () => Promise<ComponentClass> }): DemoEntry {
  const read = RAW[`../demos/${spec.file}`];
  return {
    title: spec.title,
    description: spec.description,
    load: spec.load,
    source: read ?? (() => Promise.reject(new Error(`No demo source at site/src/demos/${spec.file}`))),
  };
}

/**
 * The demo registry. To add a demo: put its component under `site/src/demos/<area>/`, then add one entry here. A page
 * embeds it with a fenced block:
 *
 *     ```demo signals
 *     Optional caption.
 *     ```
 */
export const DEMOS: Readonly<Record<string, DemoEntry>> = {
  signals: defineDemo({
    title: "Signals and computed",
    description: "Change two signals and watch which computed values re-run and which text is repainted.",
    file: "signals/signals-demo.ts",
    load: () => import("../demos/signals/signals-demo.js").then((m) => m.SignalsDemo),
  }),
  expressions: defineDemo({
    title: "Template expressions",
    description: "Type an expression and see whether the template parser accepts it.",
    file: "signals/expressions-demo.ts",
    load: () => import("../demos/signals/expressions-demo.js").then((m) => m.ExpressionsDemo),
  }),
  rxjs: defineDemo({
    title: "RxJS in templates",
    description: "Observables bind directly, and their subscriptions end with the component.",
    file: "signals/rxjs-demo.ts",
    load: () => import("../demos/signals/rxjs-demo.js").then((m) => m.RxjsDemo),
  }),
  router: defineDemo({
    title: "Router",
    description: "A mini app with nested routes, params, a guard and a lazy route, running in memory.",
    file: "router/router-demo.ts",
    load: () => import("../demos/router/router-demo.js").then((m) => m.RouterDemo),
  }),
  forms: defineDemo({
    title: "Signal forms",
    description: "A form with validation, built on signals.",
    file: "data/form-demo.ts",
    load: () => import("../demos/data/form-demo.js").then((m) => m.FormDemo),
  }),
  i18n: defineDemo({
    title: "Internationalisation",
    description: "Switch locale and see plurals, dates and numbers follow.",
    file: "data/i18n-demo.ts",
    load: () => import("../demos/data/i18n-demo.js").then((m) => m.I18nDemo),
  }),
  store: defineDemo({
    title: "Signal store",
    description: "A cart store with entities, derived state and persistence.",
    file: "data/store-demo.ts",
    load: () => import("../demos/data/store-demo.js").then((m) => m.StoreDemo),
  }),
  "renderer-dom": defineDemo({
    title: "The DOM renderer at work",
    description: "A component rendered by the real DOM renderer, with every renderer call it receives listed.",
    file: "renderer/renderer-demo.ts",
    load: () => import("../demos/renderer/renderer-demo.js").then((m) => m.RendererDemo),
  }),
  testing: defineDemo({
    title: "Tests running live",
    description: "Real @gable/testing tests mount a component into the in-memory renderer, with pass and fail output.",
    file: "testing/testing-demo.ts",
    load: () => import("../demos/testing/testing-demo.js").then((m) => m.TestingDemo),
  }),
  format: defineDemo({
    title: "Template formatter",
    description: "Edit a component and see how gable-format and the Prettier plugin lay out its html template.",
    file: "tooling/format-demo.ts",
    load: () => import("../demos/tooling/format-demo.js").then((m) => m.FormatDemo),
  }),
  "ui-dialog": defineDemo({
    title: "Headless dialog",
    description: "A modal dialog from the uiDialog* directives, with focus trap, Escape and focus restore.",
    file: "primitives/dialog-demo.ts",
    load: () => import("../demos/primitives/dialog-demo.js").then((m) => m.DialogDemo),
  }),
  "ui-tabs": defineDemo({
    title: "Headless tabs",
    description: "Tabs with roving focus and arrow, Home and End keys, styled only through attributes.",
    file: "primitives/tabs-demo.ts",
    load: () => import("../demos/primitives/tabs-demo.js").then((m) => m.TabsDemo),
  }),
  "ui-roving": defineDemo({
    title: "Roving tabindex",
    description: "A toolbar with one tab stop, arrow-key movement and a disabled item that is skipped.",
    file: "primitives/roving-demo.ts",
    load: () => import("../demos/primitives/roving-demo.js").then((m) => m.RovingDemo),
  }),
  "ui-variants": defineDemo({
    title: "Variants and cn",
    description: "The class string @gable/ui's buttonVariants and cn compute for a variant, size and your own class.",
    file: "ui/variants-demo.ts",
    load: () => import("../demos/ui/variants-demo.js").then((m) => m.VariantsDemo),
  }),
  editor: defineDemo({
    title: "Rich text editor",
    description: "A real @gable/editor editor: stock formatting plugins plus two plugins written for this page, with a hand-built toolbar.",
    file: "editor/editor-demo.ts",
    load: () => import("../demos/editor/editor-demo.js").then((m) => m.EditorDemo),
  }),
};

/** The registered demo for a fence name, or undefined. */
export const demoByName = (name: string): DemoEntry | undefined => (Object.hasOwn(DEMOS, name) ? DEMOS[name] : undefined);
