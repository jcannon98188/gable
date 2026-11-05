import { DEV } from "./dev.js";

/** The `@defer` triggers this renderer adds to the core's `when`, `idle` and `timer`. Read by the language service. */
export const DOM_TRIGGERS = ["viewport", "interaction", "hover"] as const;

const EVENTS: Record<string, readonly string[]> = {
  interaction: ["click", "keydown"],
  hover: ["mouseenter", "focusin"],
};

function fail(name: string, message: string): void {
  if (DEV) throw new Error(`@defer trigger "${name}": ${message}`);
}

/**
 * Watches the first element of the `@placeholder` and calls `fire` once.
 * `viewport(n)` takes an optional margin in pixels. Returns a function that stops watching.
 */
export function observeDomTrigger(name: string, args: unknown[], placeholder: unknown, fire: () => void): () => void {
  if (args.some((a) => typeof a === "string")) {
    fail(name, `template reference arguments are not supported yet; the trigger watches the @placeholder (got "${args.join(", ")}").`);
  }
  const el = placeholder as Element | undefined;
  if (!el || el.nodeType !== 1) {
    fail(name, "needs an @placeholder block that starts with an element to watch.");
    fire();
    return () => {};
  }
  if (name === "viewport") {
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return () => {};
    }
    const margin = typeof args[0] === "number" ? `${args[0]}px` : "0px";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          fire();
        }
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }
  const events = EVENTS[name];
  if (!events) throw new Error(`The DOM renderer has no @defer trigger "${name}". Supported: ${DOM_TRIGGERS.join(", ")}.`);
  const stop = () => events.forEach((e) => el.removeEventListener(e, onEvent));
  const onEvent = () => {
    stop();
    fire();
  };
  events.forEach((e) => el.addEventListener(e, onEvent));
  return stop;
}
