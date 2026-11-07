// The Designer's side of the project's own Vite. It is added by `project-vite-config.ts` (a wrapper handed to the
// project's Vite with `--config`), so nothing is written to the project. It does two things: injects the Preview agent
// into every page, and serves the component-mode host page for a `*.scenes.ts` module.
import { dirname } from "node:path";
import type { Plugin } from "vite";

const PAGE = "/__gable-designer/component";
const HOST = "/__gable-designer/host.js";
const VIRTUAL = "\0gable-designer-host:";

/** The generated module that mounts one scene of a scenes file. It lives in the project's module graph so it shares its `@gable/core` and renderer, and HMR works. */
export function hostModule(scenesModule: string, initial: string | null): string {
  const path = JSON.stringify(scenesModule);
  return `import * as scenesModule from ${path};
import { createComponent, createInjector, RENDERER } from "@gable/core";
import { dom } from "@gable/renderer-dom";

const root = document.getElementById("gable-scene-root");
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
  const scene = definition.scenes[name];
  if (!scene) throw new Error('No scene "' + name + '". Scenes: ' + Object.keys(definition.scenes).join(", "));
  const renderer = dom();
  injector = createInjector([{ provide: RENDERER, useValue: renderer }, ...(renderer.providers ?? []), ...(scene.providers ?? [])]);
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

export function designerPlugin(options: { agentFile: string }): Plugin {
  const agentUrl = "/@fs/" + options.agentFile.replaceAll("\\", "/").replace(/^\//, "");
  return {
    name: "gable-designer",
    configureServer(server) {
      // The agent lives outside the project; the dev server must be allowed to serve it.
      server.config.server.fs.allow.push(dirname(dirname(options.agentFile)));
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
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
      if (id.startsWith(HOST)) return VIRTUAL + id.slice(HOST.length);
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return;
      const query = new URLSearchParams(id.slice(VIRTUAL.length));
      return hostModule(query.get("scenes")!, query.get("scene"));
    },
    transformIndexHtml(_, ctx) {
      if (!ctx.server) return;
      return [
        // Two scripts, in this order: the hook has to exist before the agent module is evaluated, and static imports run first.
        { tag: "script", attrs: { type: "module" }, children: `import { installDesigner } from "@gable/core/designer"; installDesigner();`, injectTo: "head-prepend" },
        { tag: "script", attrs: { type: "module", src: agentUrl }, injectTo: "head-prepend" },
      ];
    },
  };
}
