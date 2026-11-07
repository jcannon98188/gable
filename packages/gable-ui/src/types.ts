/** What an item is: a component (copied to the components directory), a lib helper (utils directory) or a theme (CSS). */
export type ItemType = "component" | "lib" | "style";

export interface RegistryFile {
  /** Path of the file in the source tree, relative to its `src` directory: `components/button.ts`, `lib/cn.ts`. */
  path: string;
  content: string;
}

/** One installable item: the contents of `items/<name>.json`. */
export interface RegistryItem {
  name: string;
  type: ItemType;
  description: string;
  files: RegistryFile[];
  /** npm packages (name to range) the files import. */
  dependencies: Record<string, string>;
  /** npm packages needed at build time only (Tailwind for the theme). */
  devDependencies: Record<string, string>;
  /** Names of other items this one needs; `add` installs them too. */
  registryDependencies: string[];
  /** CSS `@import`s the project stylesheet must start with (`init` adds the missing ones). */
  cssImports?: string[];
  /** CSS variables, written into `:root` (light) and `.dark` (dark) of the project stylesheet. */
  cssVars?: { light?: Record<string, string>; dark?: Record<string, string> };
  /** Raw CSS (Tailwind v4 config is CSS: `@theme`, `@custom-variant`, keyframes) appended to the project stylesheet. */
  css?: string;
  /** Style items only: the base colour this theme is for. */
  baseColor?: string;
}

export interface RegistryIndexEntry {
  name: string;
  type: ItemType;
  description: string;
  /** Path of the item JSON relative to the index. */
  path: string;
}

/** `index.json`. */
export interface RegistryIndex {
  name: "gable-ui";
  /** Bumped when the JSON layout changes incompatibly. */
  formatVersion: 1;
  /** The lockstep gable version the registry was built for. */
  version: string;
  baseColors: string[];
  items: RegistryIndexEntry[];
}

/** `gable-ui.json` in the project root. */
export interface GableUiConfig {
  /** Where components are copied, relative to the project root. */
  componentsDir: string;
  /** Where helpers (cn, variants, ...) are copied. */
  utilsDir: string;
  /** The stylesheet the theme is written into. */
  css: string;
  baseColor: string;
  /** Where components come from: a directory or git URL. Absent means the registry bundled with the CLI. */
  registry?: string;
}
