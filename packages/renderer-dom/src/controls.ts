/** How a native form control exposes its value: the property to write, the event that reports changes, and how to read it back. */
export interface ControlBinding {
  property: "value" | "checked";
  event: "input" | "change";
  read(el: Element): unknown;
}

/** The value mapping by element type that the `[field]` directive (Forms) and two-way bindings share. Null for non-controls. */
export function controlBinding(el: Element): ControlBinding | null {
  const tag = el.localName;
  if (tag === "textarea") return { property: "value", event: "input", read: (e) => (e as HTMLTextAreaElement).value };
  if (tag === "select") return { property: "value", event: "change", read: (e) => (e as HTMLSelectElement).value };
  if (tag !== "input") return null;
  const type = (el as HTMLInputElement).type;
  if (type === "checkbox" || type === "radio") return { property: "checked", event: "change", read: (e) => (e as HTMLInputElement).checked };
  if (type === "number" || type === "range") {
    return {
      property: "value",
      event: "input",
      read: (e) => {
        const n = (e as HTMLInputElement).valueAsNumber;
        return Number.isNaN(n) ? null : n;
      },
    };
  }
  return { property: "value", event: type === "file" ? "change" : "input", read: (e) => (e as HTMLInputElement).value };
}
