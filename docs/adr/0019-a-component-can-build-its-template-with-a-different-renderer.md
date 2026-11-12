# A component can build its template with a different renderer

A component declares a renderer boundary in its static `meta` (a renderer factory called once per instance after setup). The component's host node stays in the parent's renderer; its template, and any content projected into its `<slot>`, is built with the boundary's renderer. This is how a DOM app embeds a Pixi scene (`<gable-canvas>`): the HUD, menus and routing stay DOM, and the subtree under the canvas host renders through the Pixi renderer. Core already passes the renderer as an argument down view building, so the change is one swap at one component, not a new concept in the template language.

The boundary subtree is built inside the host's own view, so it shares the host's scope (effects and teardown follow the host's lifetime) and its injector. The boundary layers the second renderer's `providers` as a child injector for the subtree and shadows `RENDERER` there. Services provided above the host resolve inside the scene exactly as in the DOM, which makes DI-shared signals the one channel between DOM and scene content. `Renderer` gains an optional `destroy?()`, called when the boundary's scope is disposed, so the host can release resources such as a GPU context. HMR needs nothing new: it already tracks the renderer per component, so editing a scene component rebuilds only that subtree with the live renderer, and editing the host recreates the second renderer's resources.

## Alternatives rejected

Mounting the scene from code with `createComponent` and a component class passed as an input. It needs no core change and is what the authoring prototype did, but a component created that way has no parent scope or injector, so lifetime, injector layering and `renderer.providers` had to be wired by hand, and the scene could not share template locals with the DOM around it.

A whole-app canvas renderer (every pixel, UI included, drawn by Pixi). DOM UI primitives, text input, accessibility and routing outlets all depend on DOM. A canvas-only app can still bootstrap with the Pixi renderer without any of this.

Template-level renderer switching syntax (a per-element renderer attribute). It would make the renderer of every node context-dependent in the language and in tooling, for no capability the component-level boundary lacks.

## Consequences

Using a scene tag in a DOM template, or a DOM tag in a scene, fails through the target renderer's own dev-time unknown-tag error. There is no "scene-only component" declaration; components with no renderer-specific tags work under either renderer.

Core's contract change is limited to the boundary and `destroy?()`. A frame or flush hook on the Renderer, window-level injectors and cross-renderer projection beyond `<slot>` stay out of this decision.
