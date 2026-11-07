import { Extension, Node, type Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Y_SYNC_META } from "../yjs/binding.js";
import { definePlugin } from "../plugin.js";

/** Turns a picked/pasted/dropped file into a URL the image can load from. Return the final URL. */
export type ImageUploader = (file: File) => Promise<string>;

/**
 * Options for `imagePlugin`. With no options, images are added by URL only; pass `upload` to also accept dropped and
 * pasted image files.
 *
 * @example
 * ```ts
 * imagePlugin({ upload: async (file) => (await uploadToStorage(file)).url, onUploadError: (error) => console.warn(error) });
 * ```
 */
export interface ImagePluginOptions {
  /** Without an uploader, dropped and pasted image files are ignored (URL embedding still works). */
  upload?: ImageUploader;
  /** Called when an upload rejects. */
  onUploadError?: (error: unknown, file: File) => void;
  /** Narrowest an image may be resized to, in px. Default 48. */
  minWidth?: number;
}

const isImage = (f: File) => f.type.startsWith("image/");

/** Uploads `file` and inserts the image at `pos` (default: the selection). Resolves false if the upload failed. */
export async function insertUploadedImage(editor: Editor, file: File, upload: ImageUploader, pos?: number, onError?: ImagePluginOptions["onUploadError"]): Promise<boolean> {
  try {
    const src = await upload(file);
    if (editor.isDestroyed) return false;
    const chain = editor.chain().focus();
    (pos == null ? chain : chain.setTextSelection(Math.min(pos, editor.state.doc.content.size)))
      .setImage({ src, alt: file.name })
      .run();
    return true;
  } catch (error) {
    onError?.(error, file);
    return false;
  }
}

/** The figure around the selection (a caret in its caption, or the image selected), if any. */
function figureAround(state: EditorState): { pos: number; node: import("@tiptap/pm/model").Node } | null {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "figure") return { pos: $from.before(d), node: $from.node(d) };
  return null;
}

/** A transaction that wraps every image still carrying a caption attribute in a figure, or null when there is none. */
function legacyCaptions(state: EditorState) {
  const found: { pos: number; node: import("@tiptap/pm/model").Node }[] = [];
  state.doc.descendants((node, pos, parent) => {
    if (node.type.name === "image" && node.attrs.caption && parent?.type.name !== "figure") found.push({ pos, node });
  });
  if (!found.length) return null;
  const tr = state.tr;
  const { figure: figType, figcaption: capType } = state.schema.nodes;
  for (const { pos, node } of found.reverse()) {
    const image = node.type.create({ ...node.attrs, caption: "" }, null, node.marks);
    tr.replaceWith(pos, pos + node.nodeSize, figType!.create(null, [image, capType!.create(null, state.schema.text(String(node.attrs.caption)))]));
  }
  return tr.setMeta("addToHistory", false);
}

/** `<figure><img><figcaption>…</figcaption></figure>`: an image with a caption that is ordinary, editable rich text. */
const figure = Node.create({
  name: "figure",
  group: "block",
  content: "image figcaption",
  isolating: true,
  draggable: true,
  parseHTML: () => [{ tag: "figure" }],
  renderHTML: () => ["figure", { class: "m-0 my-2" }, 0],
});

const figcaption = Node.create({
  name: "figcaption",
  content: "inline*",
  isolating: true,
  parseHTML: () => [{ tag: "figcaption" }],
  renderHTML: () => ["figcaption", { class: "text-center text-sm text-muted-foreground" }, 0],
  addKeyboardShortcuts() {
    return {
      // A caption is one line: Enter leaves it for the paragraph after the figure.
      Enter: ({ editor }) => {
        const { state } = editor;
        if (state.selection.$from.parent.type.name !== "figcaption") return false;
        const fig = figureAround(state);
        if (!fig) return false;
        const end = fig.pos + fig.node.nodeSize;
        const para = state.schema.nodes.paragraph!;
        const tr = state.tr;
        if (state.doc.resolve(end).nodeAfter?.type !== para) tr.insert(end, para.create());
        editor.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1))).scrollIntoView());
        return true;
      },
    };
  },
  onCreate() {
    const tr = legacyCaptions(this.editor.state);
    if (tr) this.editor.view.dispatch(tr);
  },
  addProseMirrorPlugins() {
    // Documents from before figures kept the caption in an attribute on the image. Convert them when they are loaded or
    // edited locally (never from Yjs: peers converting the same image concurrently would each create a figure).
    return [
      new Plugin({
        key: new PluginKey("gable-legacy-captions"),
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta(Y_SYNC_META))) return null;
          return legacyCaptions(state);
        },
      }),
    ];
  },
});

function resizableImage(options: ImagePluginOptions) {
  const min = options.minWidth ?? 48;
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: (el) => {
            const w = Number.parseInt(el.getAttribute("width") ?? "", 10);
            return Number.isFinite(w) ? w : null;
          },
          renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
        },
        caption: {
          default: "",
          // Caption lives in the figcaption of a wrapping <figure>, or `data-caption` on a bare <img>.
          parseHTML: (el) => el.getAttribute("data-caption") ?? "",
          renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
        },
      };
    },
    addCommands() {
      return {
        ...this.parent?.(),
        setImageWidth:
          (width: number | null) =>
          ({ commands }) =>
            commands.updateAttributes("image", { width: width == null ? null : Math.max(min, Math.round(width)) }),
        setImageCaption:
          (caption: string) =>
          ({ state, tr, dispatch }) => {
            const fig = figureAround(state);
            if (fig) {
              // Replace the caption's content.
              const start = fig.pos + 1 + fig.node.firstChild!.nodeSize + 1;
              const end = fig.pos + fig.node.nodeSize - 1;
              if (dispatch) tr.replaceWith(start, end, caption ? state.schema.text(caption) : []);
              return true;
            }
            const sel = state.selection;
            if (!(sel instanceof NodeSelection) || sel.node.type.name !== "image") return false;
            if (dispatch) {
              const { figure: figType, figcaption: capType } = state.schema.nodes;
              const image = sel.node.type.create({ ...sel.node.attrs, caption: "" });
              tr.replaceWith(sel.from, sel.to, figType!.create(null, [image, capType!.create(null, caption ? state.schema.text(caption) : null)]));
              tr.setSelection(NodeSelection.create(tr.doc, sel.from + 1));
            }
            return true;
          },
        toggleImageCaption:
          () =>
          ({ state, tr, dispatch }) => {
            const fig = figureAround(state);
            if (fig) {
              if (dispatch) {
                tr.replaceWith(fig.pos, fig.pos + fig.node.nodeSize, fig.node.firstChild!);
                tr.setSelection(NodeSelection.create(tr.doc, fig.pos));
              }
              return true;
            }
            const sel = state.selection;
            if (!(sel instanceof NodeSelection) || sel.node.type.name !== "image") return false;
            if (dispatch) {
              const { figure: figType, figcaption: capType } = state.schema.nodes;
              tr.replaceWith(sel.from, sel.to, figType!.create(null, [sel.node, capType!.create()]));
              tr.setSelection(TextSelection.create(tr.doc, sel.from + 1 + sel.node.nodeSize + 1));
            }
            return true;
          },
        setImageAlt:
          (alt: string) =>
          ({ commands }) =>
            commands.updateAttributes("image", { alt }),
      };
    },
    addNodeView() {
      return ({ node: initial, getPos, editor }) => {
        const doc = (editor.options.element as HTMLElement | undefined)?.ownerDocument ?? document; // the view does not exist yet while the first content renders
        const figure = doc.createElement("div");
        figure.className = "relative m-0 inline-block max-w-full";
        figure.setAttribute("data-image-figure", "");
        const img = doc.createElement("img");
        img.className = "block max-w-full h-auto";
        // Only for documents that still carry the caption in an attribute (see the legacy conversion on the figcaption node).
        const caption = doc.createElement("div");
        caption.className = "text-center text-sm text-muted-foreground";
        const handle = doc.createElement("span");
        handle.setAttribute("data-resize-handle", "");
        handle.setAttribute("role", "separator");
        handle.setAttribute("aria-orientation", "vertical");
        handle.setAttribute("aria-label", "Resize image");
        handle.setAttribute("tabindex", "0");
        handle.className = "absolute right-0 bottom-0 size-3 cursor-nwse-resize rounded-sm border bg-background";
        figure.append(img, caption, handle);

        let node = initial;
        const paint = () => {
          img.setAttribute("src", node.attrs.src);
          img.setAttribute("alt", node.attrs.alt ?? "");
          if (node.attrs.title) img.setAttribute("title", node.attrs.title);
          else img.removeAttribute("title");
          if (node.attrs.width) img.setAttribute("width", String(node.attrs.width));
          else img.removeAttribute("width");
          caption.textContent = node.attrs.caption ?? "";
          caption.hidden = !node.attrs.caption;
        };
        paint();

        const commit = (width: number) => {
          const pos = getPos();
          if (pos == null) return;
          const w = Math.max(min, Math.round(width));
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: w }));
        };
        handle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          const startX = (event as PointerEvent).clientX;
          const startW = img.getBoundingClientRect().width || Number(node.attrs.width) || min;
          let latest = startW;
          const move = (e: Event) => {
            latest = Math.max(min, startW + ((e as PointerEvent).clientX - startX));
            img.setAttribute("width", String(Math.round(latest)));
          };
          const up = () => {
            doc.removeEventListener("pointermove", move);
            doc.removeEventListener("pointerup", up);
            commit(latest);
          };
          doc.addEventListener("pointermove", move);
          doc.addEventListener("pointerup", up);
        });
        handle.addEventListener("keydown", (event) => {
          const step = event.shiftKey ? 50 : 10;
          const cur = img.getBoundingClientRect().width || Number(node.attrs.width) || min;
          if (event.key === "ArrowRight") commit(cur + step);
          else if (event.key === "ArrowLeft") commit(cur - step);
          else return;
          event.preventDefault();
        });

        return {
          dom: figure,
          update: (updated) => {
            if (updated.type !== node.type) return false;
            node = updated;
            paint();
            return true;
          },
          stopEvent: (event) => event.target === handle,
          ignoreMutation: () => true,
        };
      };
    },
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    gableImage: {
      setImageWidth: (width: number | null) => ReturnType;
      /** Give the selected image (or the figure the caret is in) a caption with this text. */
      setImageCaption: (caption: string) => ReturnType;
      /** Wrap the selected image in a figure with an empty caption and move into it, or unwrap it again. */
      toggleImageCaption: () => ReturnType;
      setImageAlt: (alt: string) => ReturnType;
      /** Upload through the plugin's uploader and insert the result. Returns true when an upload started. */
      uploadImage: (file: File) => ReturnType;
    };
  }
}

/** Images: embed by URL, upload through a pluggable adapter (command, paste, drop), resize, alt text, caption. */
export function imagePlugin(options: ImagePluginOptions = {}) {
  const uploads = Extension.create({
    name: "gableImageUpload",
    addCommands() {
      return {
        uploadImage:
          (file: File) =>
          ({ editor, tr }) => {
            if (!options.upload || !isImage(file)) return false;
            tr.setMeta("preventDispatch", true);
            void insertUploadedImage(editor, file, options.upload, undefined, options.onUploadError);
            return true;
          },
      };
    },
    addProseMirrorPlugins() {
      const editor = this.editor;
      const take = (files: FileList | null | undefined) => [...(files ?? [])].filter(isImage);
      return [
        new Plugin({
          key: new PluginKey("gable-image-upload"),
          props: {
            handlePaste: (_view, event) => {
              const files = take(event.clipboardData?.files);
              if (!options.upload || !files.length) return false;
              for (const f of files) void insertUploadedImage(editor, f, options.upload, undefined, options.onUploadError);
              return true;
            },
            handleDrop: (view, event) => {
              const files = take((event as DragEvent).dataTransfer?.files);
              if (!options.upload || !files.length) return false;
              const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
              for (const f of files) void insertUploadedImage(editor, f, options.upload, at, options.onUploadError);
              return true;
            },
          },
        }),
      ];
    },
  });
  return definePlugin({
    name: "image",
    requires: ["core"],
    extensions: [resizableImage(options), figure, figcaption, uploads],
    toolbar: [
      {
        id: "image",
        label: "Image",
        group: "insert",
        order: 21,
        input: { kind: "url", label: "Image URL" },
        run: () => false,
        runWith: (e, src) => e.chain().focus().setImage({ src }).run(),
        isActive: (e) => e.isActive("image"),
      },
      {
        id: "imageAlt",
        label: "Image alt text",
        group: "image",
        order: 22,
        input: { kind: "text", label: "Alt text" },
        run: () => false,
        runWith: (e, alt) => e.chain().focus().setImageAlt(alt).run(),
        isEnabled: (e) => e.isActive("image"),
      },
      {
        id: "imageCaption",
        label: "Image caption",
        group: "image",
        order: 23,
        run: (e) => e.chain().focus().toggleImageCaption().run(),
        isActive: (e) => e.isActive("figcaption") || figureAround(e.state) != null,
        isEnabled: (e) => e.isActive("image") || figureAround(e.state) != null,
      },
    ],
  });
}
