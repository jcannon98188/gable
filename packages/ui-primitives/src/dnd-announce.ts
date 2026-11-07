/**
 * Screen-reader announcements for drag and drop.
 *
 * There is no shared LiveAnnouncer in Gable yet, so drag and drop owns a minimal internal live region: one visually
 * hidden `<div aria-live="assertive" aria-atomic="true" data-dnd-live>` per document, appended to `document.body` the
 * first time something is announced. When a shared announcer exists, replace `announce()` with a call to it; nothing
 * else in the drag and drop code touches the region. The same module holds the (English) message strings, which an app
 * can replace with `setDndMessages` (translation, wording).
 */

export interface DndPosition {
  /** What is being moved (the item's `label`). */
  label: string;
  /** 1-based position in the list, for sortable targets. */
  position?: number;
  total?: number;
  /** Name of the container or drop zone, if it has one. */
  zone?: string;
}

export interface DndMessages {
  /** Read by assistive technology when focus lands on a draggable or sortable item (`aria-describedby`). */
  instructions: string;
  lift(i: DndPosition): string;
  /** The keyboard target changed (a new position or a new drop zone). */
  over(i: DndPosition): string;
  noTarget(i: DndPosition): string;
  drop(i: DndPosition): string;
  cancel(i: DndPosition): string;
}

const where = (i: DndPosition) => (i.zone ? ` in ${i.zone}` : "");
const at = (i: DndPosition) => (i.position !== undefined ? ` position ${i.position} of ${i.total}` : "");

const defaults: DndMessages = {
  instructions: "Press space to pick up. While picked up, use the arrow keys to move, space to drop, escape to cancel.",
  lift: (i) => `Picked up ${i.label}.${i.position !== undefined ? ` It is at${at(i)}${where(i)}.` : ""} Use the arrow keys to move, space to drop, escape to cancel.`,
  over: (i) => (i.position !== undefined ? `${i.label} moved to${at(i)}${where(i)}.` : `${i.label} is over ${i.zone ?? "a drop zone"}.`),
  noTarget: (i) => `${i.label} is not over a drop zone.`,
  drop: (i) => (i.position !== undefined ? `Dropped ${i.label} at${at(i)}${where(i)}.` : i.zone ? `Dropped ${i.label} on ${i.zone}.` : `Dropped ${i.label}.`),
  cancel: (i) => `Cancelled. ${i.label} was not moved.`,
};

let current: DndMessages = defaults;
/** Replaces some or all message strings, e.g. for another language. Call `setDndMessages({})` to restore the defaults. */
export function setDndMessages(messages: Partial<DndMessages>): void {
  current = { ...defaults, ...messages };
}
export function dndMessages(): DndMessages {
  return current;
}

const regions = new WeakMap<Document, HTMLElement>();
const hidden =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

/** Speaks `text` through the document's live region. Repeating the same text is still announced. */
export function announce(doc: Document, text: string): void {
  let region = regions.get(doc);
  if (!region || !region.isConnected) {
    region = doc.createElement("div");
    region.setAttribute("aria-live", "assertive");
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("data-dnd-live", "");
    region.setAttribute("style", hidden);
    doc.body.append(region);
    regions.set(doc, region);
  }
  region.textContent = region.textContent === text ? `${text} ` : text;
}

/** The text last announced (trailing no-break space trimmed); for tests and debugging. */
export function lastAnnouncement(doc: Document): string {
  return (regions.get(doc)?.textContent ?? "").replace(/ $/, "");
}

/** Id of the hidden element that holds the keyboard instructions, created on first use. */
export function instructionsId(doc: Document): string {
  const id = "gable-dnd-instructions";
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement("div");
    el.id = id;
    el.setAttribute("style", hidden);
    doc.body.append(el);
  }
  el.textContent = current.instructions;
  return id;
}
