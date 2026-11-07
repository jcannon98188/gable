import { bootstrap, html, signal } from "@gable/core";
import { dom } from "@gable/renderer-dom";
import type { Editor } from "@tiptap/core";
import {
  GableComments,
  GableEditorElement,
  GableSuggestions,
  defaultPlugins,
  commentsPlugin,
  linkPeers,
  tablePlugin,
  imagePlugin,
  suggestionsPlugin,
} from "@gable/editor";
import "./styles.css";

// Two clients in one page, joined by an in-memory provider. Swap `linkPeers` for `adaptProvider(new WebsocketProvider(...))`
// to collaborate across machines.
const link = linkPeers(2);
const [pa, pb] = link.peers as [(typeof link.peers)[number], (typeof link.peers)[number]];
const ann = { name: "Ann", color: "#be123c" };
const bob = { name: "Bob", color: "#1d4ed8" };
const extra = (user: typeof ann, ydoc: typeof pa.ydoc) => [
  ...defaultPlugins.filter((p) => p.name !== "history"),
  tablePlugin,
  imagePlugin(),
  commentsPlugin({ ydoc, user }),
  suggestionsPlugin({ user }),
];

class Demo {
  static meta = {
    selector: "app-root",
    imports: [GableEditorElement, GableComments, GableSuggestions],
    template: html`
      <main class="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
        <section class="flex flex-col gap-3" aria-label="Ann">
          <h2 class="m-0 text-lg font-semibold">Ann</h2>
          <gable-editor [(tiptap)]="annEditor" [plugins]="annPlugins" [ydoc]="a.ydoc" [awareness]="a.awareness" [whenSynced]="a.synced" [user]="ann" value="<h1>Shared notes</h1><p>Edit here and watch Bob's editor update. Select text and comment, or switch on suggestion mode.</p>"></gable-editor>
          <gable-comments [editor]="annEditor()"></gable-comments>
          <gable-suggestions [editor]="annEditor()"></gable-suggestions>
        </section>
        <section class="flex flex-col gap-3" aria-label="Bob">
          <h2 class="m-0 text-lg font-semibold">Bob</h2>
          <gable-editor [(tiptap)]="bobEditor" [plugins]="bobPlugins" [ydoc]="b.ydoc" [awareness]="b.awareness" [whenSynced]="b.synced" [user]="bob"></gable-editor>
          <gable-comments [editor]="bobEditor()"></gable-comments>
          <gable-suggestions [editor]="bobEditor()"></gable-suggestions>
        </section>
      </main>
    `,
  };
  a = pa;
  b = pb;
  ann = ann;
  bob = bob;
  annEditor = signal<Editor | null>(null);
  bobEditor = signal<Editor | null>(null);
  annPlugins = extra(ann, pa.ydoc);
  bobPlugins = extra(bob, pb.ydoc);
}

bootstrap(Demo, { renderer: dom(), target: "#app" });
