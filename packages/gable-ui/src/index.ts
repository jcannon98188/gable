import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { add, init, type Context } from "./commands.js";
import { readConfig } from "./config.js";
import { detectPackageManager } from "./manifest.js";
import { buildRegistry, writeRegistry } from "./registry-build.js";
import { openRegistry } from "./source.js";

export { destinationOf, resolveItems, rewriteFile, add, init } from "./commands.js";
export { CONFIG_FILE, DEFAULT_CONFIG, parseConfig, readConfig, writeConfig } from "./config.js";
export { findImports, rewriteImports, packageOf } from "./imports.js";
export { buildRegistry, writeRegistry } from "./registry-build.js";
export { openRegistry, isGitUrl } from "./source.js";
export type { Registry } from "./source.js";
export type * from "./types.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = join(here, "..");
const ownVersion = (): string => JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;

/** The CLI's side effects, injected so `main` can be driven from tests or other tools: where output goes and how dependencies are installed. */
export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Runs `<pm> install` in `cwd`; returns the exit code. Absent: installing is skipped. */
  install?(pm: string, cwd: string): number | Promise<number>;
}

const USAGE = `Usage: gable-ui <command> [options]

Commands:
  init                     Create gable-ui.json, set up the stylesheet and theme.
  add <component...>       Copy components (and the helpers and npm packages they need) into your project.
  build                    Generate a registry (index.json + items/*.json) from a gable-ui source tree.

Options:
  --registry <dir|url>     Where components come from: a registry directory, a gable-ui source tree or a git
                           URL (url#ref for a branch or tag). Default: the registry bundled with this CLI.
                           "init" remembers it in gable-ui.json.
  --local <dir>            Install @gable/* from the tarballs in <dir> (made by "npm run pack:local" in the
                           Gable repository) instead of the npm registry. For unpublished builds.
  --no-install             Edit package.json but do not run the package manager.
  --overwrite, -o          (add) Replace files that already exist and differ.
  --components-dir <dir>   (init) Default src/components/ui.
  --utils-dir <dir>        (init) Default src/lib/ui.
  --css <file>             (init) Default src/global.css.
  --base-color <name>      (init) Default neutral.
  --ui <dir>               (build) The gable-ui source tree. Default: the current directory.
  --out <dir>              (build) Where to write the registry. Default: ./registry.
  --help, -h               Show this help.
`;

/** Runs gable-ui and returns the exit code. */
export async function main(argv: string[], env: Record<string, string | undefined>, io: CliIo, cwd = process.cwd()): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: "boolean", short: "h" },
        registry: { type: "string" },
        local: { type: "string" },
        "no-install": { type: "boolean" },
        overwrite: { type: "boolean", short: "o" },
        "components-dir": { type: "string" },
        "utils-dir": { type: "string" },
        css: { type: "string" },
        "base-color": { type: "string" },
        ui: { type: "string" },
        out: { type: "string" },
      },
    });
  } catch (error) {
    io.stderr(`gable-ui: ${(error as Error).message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    io.stdout(USAGE);
    return values.help ? 0 : 2;
  }
  if (!["init", "add", "build"].includes(command)) {
    io.stderr(`gable-ui: unknown command "${command}"\n${USAGE}`);
    return 2;
  }
  if (command !== "add" && rest.length > 0) {
    io.stderr(`gable-ui: "${command}" takes no arguments\n${USAGE}`);
    return 2;
  }

  const warnings: string[] = [];
  try {
    if (command === "build") {
      const built = await buildRegistry({ uiDir: resolve(cwd, values.ui ?? "."), version: ownVersion() });
      const out = resolve(cwd, values.out ?? "registry");
      writeRegistry(built, out);
      for (const warning of built.warnings) io.stderr(`warning: ${warning}\n`);
      io.stdout(`Wrote ${built.items.length} items to ${out}\n`);
      return 0;
    }
    const ctx: Context = {
      cwd,
      log: (line) => io.stdout(line + "\n"),
      warn: (line) => (warnings.push(line), io.stderr(`warning: ${line}\n`)),
      localDir: values.local ? resolve(cwd, values.local) : undefined,
    };
    const pm = detectPackageManager(cwd, env.npm_config_user_agent);
    if (io.install) ctx.install = () => io.install!(pm, cwd);
    // Reuse the registry init recorded unless --registry overrides it.
    const spec = values.registry ?? readConfig(cwd)?.registry;
    const registry = await openRegistry(spec, { bundledDir: join(packageRoot, "registry"), version: ownVersion(), cwd });
    try {
      if (command === "init") {
        return await init(ctx, registry, {
          componentsDir: values["components-dir"],
          utilsDir: values["utils-dir"],
          css: values.css,
          baseColor: values["base-color"],
          registry: values.registry,
          noInstall: values["no-install"],
        });
      }
      return await add(ctx, registry, rest, { overwrite: values.overwrite, noInstall: values["no-install"] });
    } finally {
      registry.dispose();
    }
  } catch (error) {
    io.stderr(`gable-ui: ${(error as Error).message}\n`);
    return 1;
  }
}
