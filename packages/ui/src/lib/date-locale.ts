import { computed, effect, I18n, inject, signal, type ReadonlySignal } from "@gable/core";
import { format, type Locale } from "date-fns";

/** A date-fns locale, or a function returning one (read inside computeds, so a signal it reads re-renders). */
export type LocaleSource = Locale | (() => Locale | undefined);

/** Resolves a `LocaleSource`. */
export function resolveLocale(source: LocaleSource | undefined): Locale | undefined {
  return typeof source === "function" ? source() : source;
}

/**
 * Loads the date-fns locale called `name` (`"fr"`, `"enGB"`, `"zhTW"`: the export names of `date-fns/locale`).
 * It is called with the candidates for the current I18n locale, most specific first, until one resolves.
 * Return `undefined` (or reject) when there is none.
 */
export type DateLocaleLoader = (name: string, code: string) => Promise<Locale | { default: Locale } | undefined> | Locale | undefined;

const SCRIPT_REGION: Record<string, string> = { hant: "TW", hans: "CN" };

/**
 * The date-fns locale export names to try for a BCP 47 code, most specific first:
 * `"pt-BR"` gives `["ptBR", "pt"]`, `"zh-Hant"` gives `["zhTW", "zh"]`, `"fr"` gives `["fr"]`.
 */
export function dateFnsLocaleNames(code: string): string[] {
  const [language = "", ...rest] = code.split(/[-_]/);
  const lang = language.toLowerCase();
  if (!lang) return [];
  let region = "";
  for (const part of rest) {
    if (/^[A-Za-z]{2}$|^\d{3}$/.test(part)) region = part.toUpperCase();
    else if (!region && SCRIPT_REGION[part.toLowerCase()]) region = SCRIPT_REGION[part.toLowerCase()]!;
  }
  const names = region ? [`${lang}${region}`, lang] : [lang];
  // date-fns names the English locale enUS.
  return names.map((n) => (n === "en" ? "enUS" : n));
}

/** The first day of the week (0 Sunday to 6) of a BCP 47 locale from `Intl`, or `undefined` when the runtime does not know. */
export function intlWeekStart(code: string): number | undefined {
  try {
    const locale = new Intl.Locale(code) as Intl.Locale & { getWeekInfo?(): { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    return info ? info.firstDay % 7 : undefined;
  } catch {
    return undefined;
  }
}

export type DatePart = "month" | "caption" | "weekdayShort" | "weekdayLong" | "dayLabel" | "dayNumber";

const PATTERN: Record<DatePart, string> = { month: "LLLL", caption: "LLLL yyyy", weekdayShort: "EEEEEE", weekdayLong: "EEEE", dayLabel: "PPPP", dayNumber: "d" };
const INTL: Record<DatePart, Intl.DateTimeFormatOptions> = {
  month: { month: "long" },
  caption: { month: "long", year: "numeric" },
  weekdayShort: { weekday: "short" },
  weekdayLong: { weekday: "long" },
  dayLabel: { dateStyle: "full" },
  dayNumber: { day: "numeric" },
};

/** What the date components know about the locale. */
export interface DateLocale {
  /** The current I18n locale code (`"en"` when no I18n provider is configured). */
  code: ReadonlySignal<string>;
  /** The date-fns locale: the explicit `locale` input, else what `localeLoader` loaded for the I18n locale. */
  locale: ReadonlySignal<Locale | undefined>;
  /** The I18n service, for translating labels. */
  i18n: I18n;
  /** First day of the week for the effective locale. */
  weekStart: ReadonlySignal<number>;
  /** Formats a part of a date: date-fns with an explicit or loaded locale, English by date-fns, other languages through `Intl`. */
  part(date: Date, part: DatePart): string;
}

/**
 * Resolves the locale of a date component. Call it in a field initialiser. Order of precedence: the `locale` input
 * (a date-fns `Locale`), then the I18n locale (`I18n.locale`, which works with no provider: it is `"en"`). Names of months and
 * weekdays follow the I18n locale through `Intl`; `localeLoader` additionally loads the matching date-fns locale, which
 * is needed for date-fns patterns (the date picker's `displayFormat`) and its week start.
 */
export function useDateLocale(source: () => LocaleSource | undefined, loader: () => DateLocaleLoader | undefined): DateLocale {
  const i18n = inject(I18n);
  const code = computed(() => i18n.locale());
  const loaded = signal<{ code: string; locale: Locale } | null>(null);
  let run = 0;
  effect(() => {
    const current = code();
    const load = loader();
    const mine = ++run;
    if (!load || resolveLocale(source())) {
      loaded.set(null);
      return;
    }
    void (async () => {
      for (const name of dateFnsLocaleNames(current)) {
        try {
          const result = await load(name, current);
          const found = result && "default" in (result as object) && !("options" in (result as object)) ? (result as { default: Locale }).default : (result as Locale | undefined);
          if (found) {
            if (mine === run) loaded.set({ code: current, locale: found });
            return;
          }
        } catch {
          // try the next candidate
        }
      }
      if (mine === run) loaded.set(null);
    })();
  });
  const locale = computed(() => {
    const explicit = resolveLocale(source());
    if (explicit) return explicit;
    const l = loaded();
    return l && l.code === code() ? l.locale : undefined;
  });
  const english = (c: string) => /^en(-|_|$)/i.test(c);
  const weekStart = computed(() => {
    const fromLocale = locale()?.options?.weekStartsOn;
    if (fromLocale !== undefined) return fromLocale;
    return intlWeekStart(code()) ?? 0;
  });
  const part = (date: Date, kind: DatePart): string => {
    const loc = locale();
    const c = code();
    if (loc || english(c)) return format(date, PATTERN[kind], { locale: loc });
    try {
      return new Intl.DateTimeFormat(c, INTL[kind]).format(date);
    } catch {
      return format(date, PATTERN[kind]);
    }
  };
  return { code, locale, i18n, weekStart, part };
}
