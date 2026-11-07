import { html, signal } from '@gable/core';
import { UiJsonViewer, UiTree, type TreeNode } from '@gable/ui';

/** A small file tree with a disabled folder, a lazy folder and a row action. */
export const FILES: TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'src/app', label: 'app', children: [{ id: 'src/app/main.ts', label: 'main.ts', description: '2 KB' }, { id: 'src/app/util.ts', label: 'util.ts', description: '1 KB' }] },
      { id: 'src/vendor', label: 'vendor', disabled: true, children: [{ id: 'src/vendor/x.ts', label: 'x.ts' }] },
      { id: 'src/index.ts', label: 'index.ts', description: '312 B' },
    ],
  },
  { id: 'docs', label: 'docs', children: [{ id: 'docs/readme', label: 'readme.md' }, { id: 'docs/guide', label: 'guide.md' }] },
  { id: 'remote', label: 'remote (loads on open)', lazy: true },
  { id: 'package.json', label: 'package.json', actions: [{ id: 'open', label: 'Open package.json', text: 'open' }] },
];

/** 100 folders of 100 files: 10,100 nodes. */
export const makeBigTree = (): TreeNode[] =>
  Array.from({ length: 100 }, (_, f) => ({
    id: `d${f}`,
    label: `folder ${f}`,
    children: Array.from({ length: 100 }, (_, i) => ({ id: `d${f}/f${i}`, label: `file ${f}-${i}.ts` })),
  }));

export const makeSample = () => {
  const sample: Record<string, unknown> = {
    name: 'gable',
    version: 1.2,
    private: true,
    license: null,
    keywords: ['signals', 'templates', 'ui'],
    author: { name: 'Ada', links: { site: 'https://example.com/a/very/long/address/that/goes/on/and/on/and/on/and/on/and/on/and/on/and/on/and/on' } },
    createdAt: new Date(0),
    numbers: Array.from({ length: 1000 }, (_, i) => i * i),
    big: 12345678901234567890n,
  };
  sample['self'] = sample; // a cycle
  return sample;
};

/** The tree view (single, multiple, lazy, virtualised over 10,100 nodes) and the JSON viewer. */
export class TreeDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiTree, UiJsonViewer],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Tree view</h1>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Files (multiple selection, lazy folder, row action)</h2>
          <ui-tree label="Files" class="h-72" selectionMode="multiple" [nodes]="files" [(expanded)]="open" [(selected)]="picked" [loadChildren]="load" (activated)="last.set($event.label)" (action)="opened.set($event.node.label)"></ui-tree>
          <p class="text-sm text-muted-foreground" id="tree-state">Open: {{ open().length }}. Selected: {{ picked().length }}. Activated: {{ last() }}. Opened: {{ opened() }}.</p>
          <p class="text-sm text-muted-foreground">Arrows, Right and Left, Home and End, * (open siblings), type a letter, Space and Enter. Shift and Ctrl select several.</p>
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-lg font-medium">Virtualised, 10,100 nodes</h2>
          <ui-tree label="Big tree" selectionMode="single" [virtual]="true" [nodes]="big" [(expanded)]="bigOpen"></ui-tree>
        </section>

        <h1 class="text-2xl font-semibold tracking-tight">JSON viewer</h1>
        <section class="flex flex-col gap-2">
          <ui-json-viewer label="Package" [value]="sample" [maxString]="60" (copied)="onCopied($event)"></ui-json-viewer>
          <p class="text-sm text-muted-foreground" id="json-copied">Copied {{ copied() }}</p>
        </section>
      </main>
    `,
  };

  files = FILES;
  open = signal<string[]>(['src']);
  picked = signal<string[]>([]);
  last = signal('');
  opened = signal('');
  big = makeBigTree();
  bigOpen = signal<string[]>(this.big.slice(0, 50).map((n) => n.id));
  sample = makeSample();
  copied = signal('');

  onCopied(e: { kind: string; text: string }): void {
    this.copied.set(`${e.kind}: ${e.text}`);
  }

  load = (node: TreeNode): Promise<TreeNode[]> =>
    new Promise((resolve) => setTimeout(() => resolve([{ id: `${node.id}/a`, label: 'alpha.ts' }, { id: `${node.id}/b`, label: 'beta.ts' }]), 400));
}
