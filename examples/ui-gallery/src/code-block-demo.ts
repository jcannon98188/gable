import { html, signal } from '@gable/core';
import { UiCodeBlock, type Highlighter } from '@gable/ui';

export const TS_SAMPLE = `import { signal } from '@gable/core';

/** A counter. */
export class Counter {
  count = signal(0);
  inc(by = 1): void {
    this.count.update((n) => n + by); // bump
  }
}
const label = \`count: \${new Counter().count()}\`;`;

export const HTML_SAMPLE = `<ul class="list">
  @for (item of items(); track item.id) {
    <li [class]="item.cls" (click)="pick(item)">{{ item.name }}</li>
  }
</ul>`;

export const JSON_SAMPLE = `{
  "name": "gable",
  "version": "1.2.0",
  "private": true,
  "keywords": ["signals", "templates"],
  "license": null
}`;

export const CSS_SAMPLE = `@media (min-width: 40rem) {
  .card:hover > a { color: #0ea5e9; margin: 0 -1.5rem; }
}`;

export const BASH_SAMPLE = `# install and build
npm install --save-dev vitest && npm run build
for f in src/*.ts; do echo "$f"; done`;

export const DIFF_SAMPLE = `--- a/counter.ts
+++ b/counter.ts
@@ -1,5 +1,6 @@
 export class Counter {
-  count = 0;
+  count = signal(0);
+  step = 1;
   inc() {
-    this.count++;
+    this.count.update((n) => n + this.step);
   }`;

export const OLD_CODE = Array.from({ length: 14 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n');
export const NEW_CODE = OLD_CODE.replace('const line3 = 3;', 'const line3 = 30;').replace('const line11 = 11;\n', '');

/** A toy custom highlighter: every line in the `tag` colour (what a Shiki adapter would replace). */
export const shout: Highlighter = (code) => code.split('\n').map((l) => [{ text: l, kind: 'tag' as const }]);

/** The code block: languages, line numbers and highlights, wrap, a custom highlighter, and diffs. */
export class CodeBlockDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiCodeBlock],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Code block</h1>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">TypeScript (line numbers, highlighted lines)</h2>
          <ui-code-block id="ts" label="TypeScript example" language="ts" [code]="ts" [lineNumbers]="true" highlightLines="4,6-7" (copied)="onCopied($event)"></ui-code-block>
          <p class="text-sm text-muted-foreground" id="copy-state">Copy: {{ copied() }}</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Gable template</h2>
          <ui-code-block label="Template example" language="html" [code]="template"></ui-code-block>
        </section>

        <section class="grid gap-4 sm:grid-cols-2">
          <div class="flex min-w-0 flex-col gap-2">
            <h2 class="text-lg font-medium">JSON</h2>
            <ui-code-block label="JSON example" language="json" [code]="json"></ui-code-block>
          </div>
          <div class="flex min-w-0 flex-col gap-2">
            <h2 class="text-lg font-medium">CSS</h2>
            <ui-code-block label="CSS example" language="css" [code]="css" [wrap]="true"></ui-code-block>
          </div>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Bash, and a custom highlighter</h2>
          <ui-code-block label="Bash example" language="bash" [code]="bash"></ui-code-block>
          <ui-code-block label="Custom highlighter example" language="bash" [code]="bash" [highlighter]="custom" [copyable]="false"></ui-code-block>
        </section>

        <h1 class="text-2xl font-semibold tracking-tight">Diffs</h1>
        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Unified diff text (body highlighted as TypeScript)</h2>
          <ui-code-block id="diff-text" label="Diff text" language="diff" diffLanguage="ts" [code]="diff" [lineNumbers]="true"></ui-code-block>
        </section>
        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Computed from old and new code (1 line of context)</h2>
          <ui-code-block id="diff-computed" label="Computed diff" diffLanguage="ts" [oldCode]="oldCode" [newCode]="newCode" [context]="1" [lineNumbers]="true"></ui-code-block>
        </section>
        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Side by side</h2>
          <ui-code-block id="diff-split" label="Split diff" diffLanguage="ts" layout="split" [oldCode]="oldCode" [newCode]="newCode" [context]="1" [lineNumbers]="true" [wrap]="true"></ui-code-block>
        </section>
      </main>
    `,
  };

  ts = TS_SAMPLE;
  template = HTML_SAMPLE;
  json = JSON_SAMPLE;
  css = CSS_SAMPLE;
  bash = BASH_SAMPLE;
  diff = DIFF_SAMPLE;
  oldCode = OLD_CODE;
  newCode = NEW_CODE;
  custom = shout;
  copied = signal('nothing yet');

  onCopied(e: { ok: boolean }): void {
    this.copied.set(e.ok ? 'copied' : 'failed');
  }
}
