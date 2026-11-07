// `@gable/core/i18n`: the I18n service (locale signal, catalogs, translation) and the `i18n` tag for code.
// Template markers (`i18n`, `i18n-<attr>`) resolve through this service too; see docs/i18n.md.
import { computed, signal, untracked, type ReadonlySignal, type WritableSignal } from "./signals.js";
import { InjectionToken, inject, type Provider } from "./di.js";
import { DEV } from "./dev-hooks.js";
import { formatMessage, messageFromStrings, messageId, readCatalog, type Messages } from "./i18n-message.js";

export * from "./i18n-message.js";

/** What a catalog source may be: parsed JSON in either file shape, or a plain id-to-message map. */
export type CatalogSource = Messages | { locale?: string; translations: Messages };

/** Loads the catalog of a locale (a dynamic `import()` of a JSON file, or a `fetch`). */
export type CatalogLoader = (locale: string) => Promise<CatalogSource | { default: CatalogSource }>;

/** A message with no translation in the current locale. */
export interface MissingTranslation {
  locale: string;
  id: string;
  /** The source-language message that is shown instead. */
  message: string;
  description: string;
}

/** Configuration for the root `I18n` service, passed to {@link provideI18n}. */
export interface I18nOptions {
  /** The language the templates and `i18n` tags are written in. Messages are never "missing" in it. Default `"en"`. */
  sourceLocale?: string;
  /** The initial locale. Default: `sourceLocale`. */
  locale?: string;
  /** Catalogs known up front, by locale. */
  catalogs?: Readonly<Record<string, CatalogSource>>;
  /** Loads a catalog the first time `setLocale` needs it. */
  loader?: CatalogLoader;
  /** Called once per locale and id the first time a message has no translation. Default: a dev-only `console.warn`. */
  onMissing?: (missing: MissingTranslation) => void;
}

/**
 * The injection token that carries the {@link I18nOptions}. Set it with {@link provideI18n} rather than directly.
 */
export const I18N_OPTIONS = new InjectionToken<I18nOptions>("I18nOptions");

/**
 * Providers that configure the root `I18n` service. The service works without them (locale `"en"`, no catalogs).
 *
 * @example
 * ```ts
 * bootstrap(Root, {
 *   renderer: dom(),
 *   providers: provideI18n({ sourceLocale: "en", locale: "fr", catalogs: { fr: { greeting: "Bonjour" } } }),
 * });
 * ```
 */
export function provideI18n(options: I18nOptions = {}): Provider[] {
  return [{ provide: I18N_OPTIONS, useValue: options }];
}

/** One tag: the current text of a message, read through signals so it is reactive when read inside a computed or effect. */
export type I18nTag = (strings: TemplateStringsArray, ...values: unknown[]) => string;

const lookups = (locale: string): string[] => {
  // "zh-Hant-TW" tries itself, "zh-Hant", then "zh".
  const out = [locale];
  for (let at = locale.lastIndexOf("-"); at > 0; at = locale.lastIndexOf("-", at - 1)) out.push(locale.slice(0, at));
  return out;
};

/**
 * Root-scoped translation service. `locale` is a signal: everything that translated through it (template markers,
 * `i18n` tags, `translate`) re-renders when it changes. Messages missing from the catalog fall back to the source text.
 */
export class I18n {
  static scope = "root";

  readonly #options = inject(I18N_OPTIONS, { optional: true }) ?? {};
  readonly #locale: WritableSignal<string> = signal(this.#options.locale ?? this.#options.sourceLocale ?? "en");
  /** Replaced (not mutated) when a catalog is registered, so reads of already-shown messages update. */
  readonly #catalogs = signal<ReadonlyMap<string, Messages>>(
    new Map(Object.entries(this.#options.catalogs ?? {}).map(([locale, source]) => [locale, readCatalog(source).messages] as const)),
  );
  readonly #loading = new Map<string, Promise<void>>();
  readonly #reported = new Set<string>();
  #loader: CatalogLoader | undefined = this.#options.loader;

  readonly sourceLocale: string = this.#options.sourceLocale ?? "en";
  /** The current locale (BCP 47). Read it to depend on it; change it with `setLocale`. */
  readonly locale: ReadonlySignal<string> = this.#locale;
  /** Every missing translation reported so far (dev only), for tests and diagnostics. */
  readonly missing: MissingTranslation[] = [];
  /** The tag form of `translate`: an i18n.t tag call. Bound, so it can be passed around. */
  readonly t: I18nTag = (strings, ...values) => this.tag(strings, values);

  /** Adds (or replaces) the catalog of `locale`. Takes effect immediately, including for messages already on screen. */
  register(locale: string, catalog: CatalogSource): void {
    const { messages } = readCatalog(catalog);
    this.#catalogs.update((current) => new Map(current).set(locale, messages));
  }

  /** Sets the function `setLocale` uses to fetch catalogs that are not registered. */
  setLoader(loader: CatalogLoader | undefined): void {
    this.#loader = loader;
  }

  /** Whether a catalog is registered for `locale` (exactly; no fallback to the language). */
  has(locale: string): boolean {
    return this.#catalogs().has(locale);
  }

  /**
   * Switches the locale. A locale with no registered catalog (and not the source locale) is loaded first through the
   * loader; the old locale stays until the catalog arrives, so the UI never flashes untranslated text. Resolves when
   * the new locale is in effect. A failing load rejects and leaves the locale unchanged.
   */
  async setLocale(locale: string): Promise<void> {
    if (!this.#covered(locale)) await this.load(locale);
    this.#locale.set(locale);
  }

  /** Loads and registers the catalog of `locale` through the loader (once; concurrent calls share the request). */
  load(locale: string): Promise<void> {
    let pending = this.#loading.get(locale);
    if (!pending) {
      const loader = this.#loader;
      if (!loader) return Promise.reject(new Error(`I18n has no catalog for "${locale}" and no loader: register it or pass provideI18n({ loader })`));
      pending = loader(locale)
        .then((loaded) => {
          const source = "default" in loaded && !("translations" in loaded) ? loaded.default : loaded;
          this.register(locale, source as CatalogSource);
        })
        .finally(() => this.#loading.delete(locale));
      this.#loading.set(locale, pending);
    }
    return pending;
  }

  #covered(locale: string): boolean {
    const known = untracked(() => this.#catalogs());
    return lookups(locale).some((l) => known.has(l)) || lookups(locale).some((l) => l === this.sourceLocale);
  }

  /**
   * The message `id` in the current locale, formatted with `args` (an array for `{0}`, or an object for `{name}`).
   * Falls back to `source` (the message as authored) when the catalog has no entry, or the entry is malformed.
   * Reads `locale` and the catalogs, so inside a computed or effect it is reactive.
   */
  translate(id: string, source: string, args: readonly unknown[] | Readonly<Record<string, unknown>> = [], description = ""): string {
    const locale = this.#locale();
    const catalogs = this.#catalogs();
    for (const l of lookups(locale)) {
      const found = catalogs.get(l)?.[id];
      if (found !== undefined) {
        try {
          return formatMessage(found, args, locale);
        } catch (error) {
          if (DEV) this.#report(locale, id, source, description, `translation is not a valid message: ${(error as Error).message}`);
          break;
        }
      }
    }
    if (DEV && !lookups(locale).includes(this.sourceLocale)) this.#report(locale, id, source, description);
    return formatMessage(source, args, this.sourceLocale);
  }

  #report(locale: string, id: string, message: string, description: string, problem?: string): void {
    const key = `${locale}\u0000${id}`;
    if (this.#reported.has(key)) return;
    this.#reported.add(key);
    const entry: MissingTranslation = { locale, id, message, description };
    this.missing.push(entry);
    if (this.#options.onMissing) this.#options.onMissing(entry);
    else console.warn(`[gable] i18n: ${problem ?? "no translation"} for ${locale} (id ${id}): ${JSON.stringify(message)}`);
  }

  /** The tag form: values fill `{0}`, `{1}`... Signals in the holes are read, so the result tracks them. */
  tag(strings: TemplateStringsArray | readonly string[], values: readonly unknown[]): string {
    const { message, marker } = messageFromStrings(strings, (strings as TemplateStringsArray).raw);
    const args = values.map(unwrap);
    return this.translate(marker.id ?? messageId(message, marker.description), message, args, marker.description);
  }
}

/** Signals are plain zero-parameter functions, so a hole holding one is read; every other value passes through. */
function unwrap(value: unknown): unknown {
  return typeof value === "function" && value.length === 0 ? (value as () => unknown)() : value;
}

/**
 * Translates a message in component or service code. Call it in a field initialiser; it returns a signal of the
 * current text, which follows the locale and any signals in the holes:
 *
 *     greeting = i18n`Hello ${this.name}`;      // template: {{ greeting() }}
 *     status   = i18n`:order status@@orderStatus:${this.count} orders`;
 *
 * A leading `:description@@id:` block sets the description and explicit id. Outside an injection context, or to get
 * a plain string, use `inject(I18n).t`...``.
 */
export function i18n(strings: TemplateStringsArray, ...values: unknown[]): ReadonlySignal<string> {
  const service = inject(I18n);
  return computed(() => service.tag(strings, values));
}
