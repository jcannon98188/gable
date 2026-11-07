// The Designer's side of the project's own Vite. It is added by `project-vite-config.ts` (a wrapper handed to the
// project's Vite with `--config`), so nothing is written to the project. It injects the Preview agent into every page,
// serves the component-mode host page for a `*.scenes.ts` module, and, in page mode, injects a scenario module that
// applies a scene's providers and HTTP mocks to the real app before it bootstraps.
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Plugin } from "vite";
import { AXE_PATH, SCENARIO_PARAM } from "../protocol.js";

const PAGE = "/__gable-designer/component";
const HOST = "/__gable-designer/host.js";
const INSTALL = "/__gable-designer/install.js";
const INSTALL_ID = "\0gable-designer-install";
const VIRTUAL = "\0gable-designer-host:";

const SCENARIO = "/__gable-designer/scenario.js";
const SCENARIO_VIRTUAL = "\0gable-designer-scenario:";

/**
 * Every mocked HTTP request lands here, for the Designer's HTTP panel (the agent reads it). In a Designer session the agent's
 * network hook (agent/network.ts) also logs each one and puts the frame's network condition (slow, error, offline) on the reply.
 */
const MOCK_LOG = `const log = (globalThis.__GABLE_DESIGNER_HTTP__ ??= []);
const net = () => globalThis.__GABLE_DESIGNER_NET__;
const conditioned = (list) => list.map((m, i) => ({ ...m, reply: (req) => { const r = typeof m.reply === "function" ? m.reply(req) : m.reply; return net() ? net().reply(req, r, i) : r; } }));
const mocks = (scene) => (scene.http ? mockHttp(conditioned(scene.http), { onRequest: (e) => { log.push({ ...e, at: Date.now() }); if (log.length > 200) log.shift(); if (e.mock < 0) net()?.unmatched(e); } }) : []);`;

/**
 * The generated module that applies a Scenario to the REAL app (page mode). The plugin injects it ahead of the page's own
 * scripts and it statically imports the scenes file, so by the time `bootstrap` runs the scenario's providers and HTTP
 * mocks are in the design hook's `rootProviders`. Inputs are ignored: the app has no one to set them.
 */
export function scenarioModule(scenesModule: string, name: string): string {
  const path = JSON.stringify(scenesModule);
  const scene = JSON.stringify(name);
  return `import definition from ${path};
import { mockHttp } from "@gable/core/http";
${MOCK_LOG}
const hook = globalThis.__GABLE_DESIGNER_HOOK__;
const scene = definition.scenes[${scene}];
if (hook && scene) {
  log.length = 0;
  hook.rootProviders = [...mocks(scene), ...(scene.providers ?? [])];
  globalThis.__GABLE_PAGE_SCENARIO__ = { module: ${path}, name: ${scene}, url: scene.url ?? null, mocks: (scene.http ?? []).map((m) => ({ method: m.method ?? "*", url: String(m.url) })) };
}
`;
}

/** The generated module that mounts one scene of a scenes file. It lives in the project's module graph so it shares its `@gable/core` and renderer, and HMR works. */
export function hostModule(scenesModule: string, initial: string | null): string {
  const path = JSON.stringify(scenesModule);
  return `import * as scenesModule from ${path};
import { createComponent, createInjector, RENDERER } from "@gable/core";
import { mockHttp } from "@gable/core/http";
import { dom } from "@gable/renderer-dom";

const root = document.getElementById("gable-scene-root");
${MOCK_LOG}
let definition = scenesModule.default;
let ref = null;
let injector = null;
let current = ${JSON.stringify(initial)};

function unmount() {
  ref?.destroy();
  injector?.destroy();
  root.replaceChildren();
  ref = injector = null;
}

function mount(name) {
  unmount();
  log.length = 0;
  const scene = definition.scenes[name];
  if (!scene) throw new Error('No scene "' + name + '". Scenes: ' + Object.keys(definition.scenes).join(", "));
  const renderer = dom();
  injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(renderer.providers ?? []), ...mocks(scene), ...(scene.providers ?? [])]);
  ref = createComponent(definition.component, { injector, renderer, inputs: scene.inputs, parent: root });
  current = name;
}

function publish() {
  globalThis.__GABLE_SCENES__ = {
    module: ${path},
    component: definition.component.name,
    scenes: Object.entries(definition.scenes).map(([name, scene]) => ({ name, description: scene.description })),
    get current() { return current; },
    mount,
  };
  globalThis.dispatchEvent(new Event("gable:scenes-ready"));
}

if (!current || !definition.scenes[current]) current = Object.keys(definition.scenes)[0];
publish();
mount(current);

// Editing the scenes file re-mounts the current scene; editing the component is a normal hot update.
if (import.meta.hot) {
  import.meta.hot.accept(${path}, (next) => {
    if (!next?.default) return;
    definition = next.default;
    if (!definition.scenes[current]) current = Object.keys(definition.scenes)[0];
    publish();
    mount(current);
  });
}
`;
}

/**
 * axe-core as an ES module for the agent. axe's UMD build assigns `window.axe` when it finds a window (as a plain script tag
 * would); the module only re-exports that. Read from the Designer's own dependency, so the project needs no axe-core.
 */
export async function axeModule(axeFile: string | null): Promise<string> {
  if (!axeFile) return 'throw new Error("axe-core is not installed with the Designer, so accessibility checks cannot run.");\n';
  return `${await readFile(axeFile, "utf8")}\nexport default globalThis.axe;\n`;
}

export function designerPlugin(options: { agentFile: string; axeFile?: string | null }): Plugin {
  const agentUrl = "/@fs/" + options.agentFile.replaceAll("\\", "/").replace(/^\//, "");
  return {
    name: "gable-designer",
    configureServer(server) {
      // The agent lives outside the project; the dev server must be allowed to serve it.
      server.config.server.fs.allow.push(dirname(dirname(options.agentFile)));
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (url.split("?")[0] === AXE_PATH) {
          res.setHeader("content-type", "text/javascript");
          res.setHeader("cache-control", "no-cache");
          return void res.end(await axeModule(options.axeFile ?? null));
        }
        if (!url.startsWith(PAGE)) return next();
        const query = new URL(url, "http://x").searchParams;
        const scenes = query.get("scenes");
        if (!scenes || !scenes.startsWith("/") || scenes.includes("..")) {
          res.statusCode = 400;
          return void res.end("component mode needs ?scenes=/path/to/x.scenes.ts");
        }
        const host = `${HOST}?${new URLSearchParams({ scenes, ...(query.get("scene") ? { scene: query.get("scene")! } : {}) })}`;
        const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Component mode</title></head><body><div id="gable-scene-root"></div><script type="module" src="${host}"></script></body></html>`;
        res.setHeader("content-type", "text/html");
        res.end(await server.transformIndexHtml(url, page));
      });
    },
    resolveId(id) {
      if (id === INSTALL) return INSTALL_ID;
      if (id.startsWith(SCENARIO)) return SCENARIO_VIRTUAL + id.slice(SCENARIO.length);
      if (id.startsWith(HOST)) return VIRTUAL + id.slice(HOST.length);
    },
    load(id) {
      if (id === INSTALL_ID) return `import { installDesigner } from "@gable/core/designer";
installDesigner();
`;
      if (id.startsWith(SCENARIO_VIRTUAL)) {
        const q = new URLSearchParams(id.slice(SCENARIO_VIRTUAL.length));
        return scenarioModule(q.get("scenes")!, q.get("scene")!);
      }
      if (!id.startsWith(VIRTUAL)) return;
      const query = new URLSearchParams(id.slice(VIRTUAL.length));
      return hostModule(query.get("scenes")!, query.get("scene"));
    },
    transformIndexHtml(_, ctx) {
      if (!ctx.server) return;
      const scenario = new URL(ctx.originalUrl ?? ctx.path, "http://x").searchParams.get(SCENARIO_PARAM);
      const bar = scenario ? scenario.lastIndexOf("|") : -1;
      const scenes = bar > 0 ? scenario!.slice(0, bar) : null;
      // Only a project-relative path is accepted: the name goes into generated code and into an import.
      const page = scenes && scenes.startsWith("/") && !scenes.includes("..") ? scenarioTag(scenes, scenario!.slice(bar + 1)) : [];
      return [
        // Two scripts, in this order: the hook has to exist before the agent module is evaluated, and static imports run first.
        { tag: "script", attrs: { type: "module", src: INSTALL }, injectTo: "head-prepend" },
        { tag: "script", attrs: { type: "module", src: agentUrl }, injectTo: "head-prepend" },
        ...page,
      ];
    },
  };
}

const scenarioTag = (scenes: string, scene: string) => [
  { tag: "script", attrs: { type: "module", src: `${SCENARIO}?${new URLSearchParams({ scenes, scene })}` }, injectTo: "head-prepend" as const },
];
