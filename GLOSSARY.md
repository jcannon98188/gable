# Gable

A client-side web framework that keeps the best of Angular, makes true HMR a first-class feature, and needs no framework-specific compiler.

## Language

**Framework compiler**:
A build-time tool specific to the framework that must transform authored code (templates, metadata) before it can run. Gable has none as a baseline requirement. General-purpose bundlers and dev servers are allowed; they just can't be required to understand gable's templates or metadata.
_Avoid_: AOT, template compiler, ngc/Ivy-style compilation

**TypeScript transpile**:
Stripping types from authored TypeScript so the browser can run it. Permitted in the baseline; it is not a framework compiler.
_Avoid_: Compilation, compile

**True HMR**:
Editing a component, template, style or service updates the running app with no page reload and with all state preserved (component, service and router state).
_Avoid_: Live reload, hot reload, fast refresh

**Component**:
The unit of UI: a class with inputs, outputs and a template, whose dependencies come from injection.
_Avoid_: Widget, view

**Template**:
The declarative description of a component's UI, written in Angular-flavoured syntax and interpreted at runtime.
_Avoid_: View, markup

**Signal**:
A reactive value in the synchronous state graph, based on the TC39 Signals semantics.
_Avoid_: Observable (that is a different concept), reactive variable

**Observable**:
An RxJS stream of async values or events, bridged explicitly to and from Signals.
_Avoid_: Stream, signal

**Template language service**:
The editor and type-checking support for Templates, delivered as a TypeScript language-service plugin. Tooling only; never required to run an app.
_Avoid_: LSP, compiler plugin

**Renderer**:
The pluggable layer that turns a Component's Template into output on a target platform. The DOM renderer is one renderer; a future native renderer (gable.native) is another.
_Avoid_: Platform, backend, view engine

**Platform services**:
Capabilities a target platform supplies through injection alongside its Renderer, such as location and history for the router. The core and router depend only on abstract Tokens; each platform provides the implementations.
_Avoid_: Platform APIs, environment

**Test renderer**:
An in-memory Renderer that builds an inspectable node tree with no DOM. It is the reference implementation of the Renderer contract and the way Components are unit-tested.
_Avoid_: Mock renderer, fake DOM, jsdom

**Injector**:
A node in the single injector tree (root app, then route, then component) that resolves Tokens to instances through Providers.
_Avoid_: Container, module

**Token**:
The key a dependency is requested by: a class or an `InjectionToken`.
_Avoid_: Key, service identifier

**Host**:
The renderer-provided output node a Component mounts into, matched in templates by selector. Not a custom element.
_Avoid_: Element, mount point


**Deferred block**:
A template block (`@defer`) whose content, and any lazily imported components inside it, loads when a trigger fires.
_Avoid_: Lazy block, suspense

**View model**:
The computed signals a Component exposes so its Template only reads values and never derives them. Derived values are included in the view model rather than fetched through method calls.
_Avoid_: Presenter, getter

**Setup**:
The field initialisers of a Component or service class: the only place its state and reactions are created. Classes have no constructors, so setup is declarative and safe to run again.
_Avoid_: Constructor logic, init

**State transfer**:
Carrying an instance's current state into its replacement during a hot update: values of matching fields are copied by name and kind, new fields start fresh, removed fields are dropped.
_Avoid_: Hydration, restore

**Route**:
A node in the router's configuration that maps a URL path to a Component, and may nest child Routes and provide its own Providers (which create a route Injector).
_Avoid_: Page, screen, view

**Outlet**:
The place in a Component's Template where the Component of the next nested Route is mounted.
_Avoid_: Router view, slot (slots are for content projection)

**Guard**:
A function run in a Route's injection context that decides whether navigation may proceed, cancel, or redirect.
_Avoid_: Interceptor, middleware

**Type-check block**:
A generated, never-run piece of TypeScript that represents one Template's expressions and scope so the real type checker can check them. Tooling only; it exists in the Template language service and is never emitted.
_Avoid_: Shadow code, template compile output

**Rule**:
A named diagnostic of the Template language service with a stable id and a severity (`off`, `warn` or `error`). Template rules check template content; file rules check the surrounding TypeScript.
_Avoid_: Lint, check

**Form**:
A signal over a data object, whose properties are themselves Fields. The data object is the single source of truth; Fields are derived views of it.
_Avoid_: Control group, form group

**Field**:
A node of a Form: a writable signal of one part of the data, carrying its own state (errors, touched, dirty, pending, disabled) and, where the data is an object or array, child Fields.
_Avoid_: Control, form control, input

**Schema**:
The declaration of a Form's Rules, conditional state and async checks, written against typed paths into the data. Schemas compose.
_Avoid_: Validators config, form definition

**Field error**:
A plain object with a `kind` and optional extra data, produced by a validator. Display text is not part of forms.
_Avoid_: Error message, validation result

**Error handler**:
The single Token every runtime failure is reported to, together with where it happened and which Component owned it. Reporting never crashes the app; failures are soft and the affected part keeps its last good state or renders nothing.
_Avoid_: Exception handler, error boundary, global catch

**Interceptor**:
A function run in the injection context that sits between an HTTP request and the network backend: it receives an immutable request and a `next`, and may change the request, the response or the outcome. Interceptors layer by injector depth. Unrelated to a Guard, which decides navigation.
_Avoid_: Middleware, HTTP filter

**HTTP backend**:
The Token that actually sends an HTTP request, with `fetch` as its default. Interceptors wrap it; the test harness replaces it with a recording fake.
_Avoid_: Transport, adapter

**Fixture**:
The handle a test gets from mounting a Component or app: the instance, the rendered node tree, ways to query and interact with it, and control over flushing. Torn down automatically after the test.
_Avoid_: Test bed, wrapper, harness (the harness is the whole testing package)

**Entry point**:
A subpath of a package that users import from on its own (such as the router, forms or HTTP client of the core package), so unused features are left out of a bundle and everything still ships under one version. Optional features are entry points, not separate packages.
_Avoid_: Sub-package, plugin, module

**Lockstep release**:
All Gable npm packages share one version number and are published together, so any set of Gable packages at the same version is guaranteed to work together.
_Avoid_: Fixed versioning, synchronized release

## Designer

**Designer**:
The standalone visual editor for Gable apps, used by developers and non-developers alike. It edits the project's source files and never holds a design of its own.
_Avoid_: Builder, studio, WYSIWYG, editor

**Preview agent**:
The dev-only code inside a previewed app that reports its Component tree, live Signal values and the source location of each rendered node to the Designer.
_Avoid_: Inspector, bridge, probe

**Scenario**:
A named set of Component inputs, provider overrides and mocked HTTP replies that places a Component, or the whole app in page mode, in one situation, such as empty, loading or error, so the Designer can show it. Scenarios are written in the project's source beside the Component.
_Avoid_: Story, preset, mock

**Frame**:
One preview of the app at a chosen device size and environment inside the Designer's canvas. Several Frames can be shown at once, and each runs its own instance of the app.
_Avoid_: Viewport, device, artboard
