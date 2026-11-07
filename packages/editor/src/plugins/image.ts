import { Extension, type Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { definePlugin } from "../plugin.js";

/** Turns a picked/pasted/dropped file into a URL the image can load from. Return the final URL. */
export type ImageUploader = (file: File) => Promise<string>;

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
          ({ commands }) =>
            commands.updateAttributes("image", { caption }),
        setImageAlt:
          (alt: string) =>
          ({ commands }) =>
            commands.updateAttributes("image", { alt }),
      };
    },
    addNodeView() {
      return ({ node: initial, getPos, editor }) => {
        const doc = editor.view.dom.ownerDocument;
        const figure = doc.createElement("figure");
        figure.className = "relative m-0 inline-block max-w-full";
        figure.setAttribute("data-image-figure", "");
        const img = doc.createElement("img");
        img.className = "block max-w-full h-auto";
        const caption = doc.createElement("figcaption");
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
      setImageCaption: (caption: string) => ReturnType;
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
    extensions: [resizableImage(options), uploads],
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
        input: { kind: "text", label: "Caption" },
        run: () => false,
        runWith: (e, caption) => e.chain().focus().setImageCaption(caption).run(),
        isEnabled: (e) => e.isActive("image"),
      },
    ],
  });
}
