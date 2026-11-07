// How the view builder renders template i18n markers: text of `i18n` elements and `i18n-<attr>` attributes.
// Both read the I18n service's signals inside an effect, so they re-render when the locale or a catalog changes.
import { effect } from "./signals.js";
import type { Renderer } from "./renderer.js";
import { evaluate, type Env, type Expr } from "./expression.js";
import { currentScope } from "./scope.js";
import { FAILED, guard } from "./errors.js";
import { viewOf } from "./view-context.js";
import { I18n } from "./i18n.js";
import { formatMessage } from "./i18n-message.js";
import type { I18nInfo } from "./template.js";

function serviceOf(env: Env): I18n | null {
  return viewOf(env)?.injector?.get(I18n, { optional: true }) ?? null;
}

/** The text of an `i18n` element: translated, with the `{{ }}` values as the message's arguments. */
export function buildI18nText<N>(parts: Array<string | Expr>, info: I18nInfo, renderer: Renderer<N>, env: Env, parent: N, before: N | null): () => N[] {
  const service = serviceOf(env);
  const exprs = parts.filter((p): p is Expr => typeof p !== "string");
  const text = renderer.createText("");
  renderer.insert(parent, text, before);
  const safe = guard(currentScope(), "i18n");
  effect(() => {
    const out = safe(() => {
      const args = exprs.map((e) => evaluate(e, env));
      return service ? service.translate(info.id, info.message, args, info.description) : formatMessage(info.message, args);
    });
    if (out !== FAILED) renderer.setText(text, out);
  });
  return () => [text];
}

/** Applies `i18n-<attr>` attributes through `apply(name, translated)`, and again whenever the locale changes. */
export function bindI18nAttrs(attrs: ReadonlyArray<{ name: string; i18n: I18nInfo }>, env: Env, apply: (name: string, value: string) => void): void {
  const service = serviceOf(env);
  for (const { name, i18n } of attrs) {
    effect(() => apply(name, service ? service.translate(i18n.id, i18n.message, [], i18n.description) : formatMessage(i18n.message)));
  }
}
