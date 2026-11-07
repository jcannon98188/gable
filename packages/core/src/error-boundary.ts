import { html } from "./template.js";
import { input } from "./input.js";
import { output } from "./output.js";
import { signal, effect, untracked } from "./signals.js";
import { currentScope } from "./scope.js";
import type { ErrorSource } from "./errors.js";

const DEFAULT_CATCH: readonly ErrorSource[] = ["setup", "effect", "binding", "subscription"];

/**
 * Renders its content; when something below it fails, replaces that content with fallback content.
 *
 * ```html
 * <gable-error-boundary>
 *   <app-widget></app-widget>
 *   <p slot="fallback">Something went wrong. <button (click)="reset()">Retry</button></p>
 * </gable-error-boundary>
 * ```
 *
 * Failures are still reported to the `ErrorHandler` first, so logging is unaffected. Which sources trip the
 * boundary is set by `catch` (default: setup, effect, binding, subscription; events and router/lazy
 * failures only report). Read the failure with `viewChild(ErrorBoundary)` and call `reset()` to rebuild the
 * content from scratch (new component instances, fresh state). A change to `resetKey` also resets. A failure
 * inside the fallback, or one the boundary does not catch, goes to the next boundary up.
 */
export class ErrorBoundary {
  static meta = {
    selector: "gable-error-boundary",
    template: html`@if (failed()) {<slot name="fallback"></slot>} @else {<slot></slot>}`,
  };
  /** The error sources that show the fallback. */
  catch = input<readonly ErrorSource[]>(DEFAULT_CATCH);
  /** When this value changes while failed, the boundary resets. */
  resetKey = input<unknown>(undefined);
  /** Emits the error each time the boundary trips. */
  failure = output<unknown>();
  /** The error that tripped the boundary, or undefined while healthy. */
  error = signal<unknown>(undefined);
  /** True while the fallback is showing. */
  failed = signal(false);

  private tripped = false;
  private readonly wired = (() => {
    const scope = currentScope();
    if (scope?.owner) {
      scope.owner.boundary = (error, source) => {
        if (this.tripped || !this.catch().includes(source as ErrorSource)) return false;
        this.tripped = true;
        // Deferred: the failure can surface while the boundary's own view is mid-build, which a signal write would miss.
        queueMicrotask(() => {
          if (scope.disposed) return;
          this.error.set(error);
          this.failed.set(true);
          this.failure.emit(error);
        });
        return true;
      };
    }
    let first = true;
    effect(() => {
      this.resetKey();
      if (first) first = false;
      else untracked(() => this.reset());
    });
  })();

  /** Clears the error and rebuilds the content. */
  reset(): void {
    this.tripped = false;
    this.error.set(undefined);
    this.failed.set(false);
  }
}
