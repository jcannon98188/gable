// Generates a large Gable app: a tree of N components (fanout 4), each with signals, a computed field, a method,
// a template and a style, plus one shared service. Only a few markers are rewritten by the benchmark (see EDITS).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FANOUT = 4;

/** Indexes of the children of component i in a tree of n components. */
export const childrenOf = (i, n) => Array.from({ length: FANOUT }, (_, j) => FANOUT * i + j + 1).filter((c) => c < n);

/** The edit targets: a leaf (no descendants) and an inner component near the root (about n/4 descendants). */
export function targetsFor(n) {
  let leaf = n - 1;
  while (leaf % 10 !== 0 || childrenOf(leaf, n).length) leaf--;
  return { leaf, inner: 1 };
}

const className = (i) => `C${i}`;

export function componentSource(i, n, injectsStore) {
  const kids = childrenOf(i, n);
  const imports = kids.map((c) => `import { ${className(c)} } from './c${c}.js';`).join("\n");
  const kidTags = kids.map((c) => `        <app-c${c}></app-c${c}>`).join("\n");
  return `import { computed, html, inject, signal } from '@gable/core';
import { Store } from './store.js';
${imports}

export class ${className(i)} {
  static meta = {
    selector: 'app-c${i}',
    imports: [${kids.map(className).join(", ")}],
    styles: \`
      .node { display: block; margin: 0; }
      .probe-style { padding-left: 0px; }
    \`,
    template: html\`
      <div class="node">
        <span class="probe-text">T0</span>
        <span class="probe-field">{{ fieldText() }}</span>
        <span class="probe-method">{{ last() }}</span>
        <span class="probe-style">{{ count() }}</span>
${injectsStore ? `        <span class="probe-store">{{ store.label() }}</span>
        <button class="bump" (click)="store.bump()">bump</button>\n` : ""}        <button class="mark" (click)="mark()">mark</button>
        <button class="inc" (click)="inc()">+</button>
        <input class="draft" />
${kidTags}
      </div>
    \`,
  };

  store = inject(Store);
  count = signal(0);
  fmt(n: number): string {
    return 'M0:' + n;
  }
  fieldText = computed(() => 'F0:' + this.count());
  last = signal('none');

  mark(): void {
    this.last.set(this.fmt(this.count()));
  }

  inc(): void {
    this.count.update((c) => c + 1);
  }
}
`;
}

export const storeSource = `import { computed, signal } from '@gable/core';

export class Store {
  static scope = 'root';

  value = signal(0);
  label = computed(() => 'S0:' + this.value());

  bump(): void {
    this.value.update((v) => v + 1);
  }
}
`;

/** Writes the app for n components into dir (replacing it) and returns the target indexes. */
export function generateApp(dir, n) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  const targets = targetsFor(n);
  const injecting = new Set([targets.leaf, targets.inner]);
  for (let i = 0; i < n; i++) writeFileSync(join(dir, "src", `c${i}.ts`), componentSource(i, n, i % 10 === 0 || injecting.has(i)));
  writeFileSync(join(dir, "src", "store.ts"), storeSource);
  writeFileSync(
    join(dir, "src", "main.ts"),
    `import { bootstrap } from '@gable/core';\nimport { dom } from '@gable/renderer-dom';\nimport { C0 } from './c0.js';\n\nbootstrap(C0, { renderer: dom(), target: '#app' });\n`,
  );
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Gable HMR benchmark</title>
    <script>
      // Survives HMR, lost on a full page reload.
      window.__bench = { id: Math.random().toString(36).slice(2) };
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "DOM"],
          useDefineForClassFields: true, strict: true, noEmit: true, skipLibCheck: true,
          verbatimModuleSyntax: true, isolatedModules: true, types: ["vite/client"],
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
  return targets;
}

/**
 * The benchmark's edit kinds. `file` names the file to rewrite, `edit(source, k)` returns the source with marker k,
 * `ready` is the page-side predicate source (receives the target's host selector and k) that is true once the DOM
 * shows the edit, and `state` names the state expected to survive.
 */
export const EDITS = {
  "class field": {
    file: (i) => `c${i}.ts`,
    edit: (s, k) => s.replace(/'F\d+:'/, `'F${k}:'`),
    probe: ".probe-field",
    ready: (el, k) => el.textContent.startsWith(`F${k}:`),
  },
  "class method": {
    file: (i) => `c${i}.ts`,
    edit: (s, k) => s.replace(/'M\d+:'/, `'M${k}:'`),
    probe: ".probe-method",
    // A hot-swapped method only runs when called, so the waiter keeps clicking this button (which calls it).
    drive: ".mark",
    ready: (el, k) => el.textContent.startsWith(`M${k}:`),
  },
  "template text": {
    file: (i) => `c${i}.ts`,
    edit: (s, k) => s.replace(/>T\d+</, `>T${k}<`),
    probe: ".probe-text",
    ready: (el, k) => el.textContent === `T${k}`,
  },
  style: {
    file: (i) => `c${i}.ts`,
    edit: (s, k) => s.replace(/padding-left: \d+px/, `padding-left: ${k}px`),
    probe: ".probe-style",
    ready: (el, k) => getComputedStyle(el).paddingLeft === `${k}px`,
  },
  service: {
    file: () => "store.ts",
    edit: (s, k) => s.replace(/'S\d+:'/, `'S${k}:'`),
    probe: ".probe-store",
    ready: (el, k) => el.textContent.startsWith(`S${k}:`),
  },
};
