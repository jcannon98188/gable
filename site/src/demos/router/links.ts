import { RouterLink, RouterLinkActive } from "@gable/core/router";

// The template checker (gable-check) learns which selector an imported class answers to from its `static meta`
// literal. Core's published typings widen the router directives' selectors to `string`, so it reports
// `routerLink is not imported` even when RouterLink is. These subclasses restate the same selectors as literals and
// inherit everything else (inputs, host bindings, behaviour) from the real directives.

/** `[routerLink]`: the core RouterLink, with its selector visible to the checker. */
export class DemoLink extends RouterLink {
  static override meta = { selector: "[routerLink]", host: { "[attr.href]": "href()", "(click)": "onClick($event)" } };
}

/** `[routerLinkActive]`: the core RouterLinkActive, with its selector visible to the checker. */
export class DemoLinkActive extends RouterLinkActive {
  static override meta = { selector: "[routerLinkActive]" };
}
