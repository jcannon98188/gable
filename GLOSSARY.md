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

**Injector**:
A node in the single injector tree (root app, then route, then component) that resolves Tokens to instances through Providers.
_Avoid_: Container, module

**Token**:
The key a dependency is requested by: a class or an `InjectionToken`.
_Avoid_: Key, service identifier

**Host**:
The renderer-provided output node a Component mounts into, matched in templates by selector. Not a custom element.
_Avoid_: Element, mount point

**Pipe**:
A template-only formatting function applied with `|`, instantiated per binding. Pure unless it opts out.
_Avoid_: Filter, formatter

**Deferred block**:
A template block (`@defer`) whose content, and any lazily imported components inside it, loads when a trigger fires.
_Avoid_: Lazy block, suspense
