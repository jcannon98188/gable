import { effect, injectHost } from "@gable/core";

/**
 * Keeps the host element's `class` attribute equal to `classes()`. Templates cannot call functions, so a component
 * computes its class string (see `variants` and `cn`) and hands the computed to this helper. Call it in Setup.
 *
 * The attribute is replaced as a whole, so the component should fold the user's own `class` in with `cn(base, userClass)`;
 * a `class` written on the element is available as a `class` input of the directive.
 */
export function useHostClass(classes: () => string): void {
  const { renderer, host } = injectHost();
  effect(() => renderer.setAttribute(host, "class", classes()));
}
