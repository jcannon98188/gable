// Ambient types for what the Gable Vite plugin adds to imports. Reference once per project:
//   /// <reference types="@gablejs/vite/client" />
// or list "@gablejs/vite/client" in tsconfig `compilerOptions.types`.

/**
 * `import hero from "./hero.json?family"` (spritesheet JSON or bitmap-font descriptor): the final URL of the descriptor, with its
 * sibling files hashed and the descriptor rewritten to match. Use it as a bundle entry's `src`. Needs `gableAssetFamilies()`.
 */
declare module "*?family" {
  const url: string;
  export default url;
}
