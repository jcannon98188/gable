import { cn, type ClassValue } from "./cn.js";

type VariantMap = Record<string, Record<string, ClassValue>>;
type Selection<V extends VariantMap> = { [K in keyof V]?: keyof V[K] & string };

/** The description `variants()` takes: base classes, one class value per option of each variant, defaults, and compound variants. */
export interface VariantsConfig<V extends VariantMap> {
  /** Classes every result has. */
  base?: ClassValue;
  /** `{ size: { sm: "h-8", lg: "h-10" } }`: one class value per option of each variant. */
  variants: V;
  /** The option used when a variant is not given. */
  defaultVariants?: Selection<V>;
  /** Extra classes when several variants have particular options at once. */
  compoundVariants?: Array<Selection<V> & { class: ClassValue }>;
}

/**
 * A small class-variance-authority: describe the variants once, call the result with a selection to get the class string.
 * Templates cannot call functions, so a component calls it in a `computed` and binds the string:
 *
 *   const badge = variants({ base: "rounded px-2", variants: { tone: { info: "bg-sky-100", warn: "bg-amber-100" } }, defaultVariants: { tone: "info" } });
 *   classes = computed(() => badge({ tone: this.tone(), class: this.class() }));
 *
 * Conflicting utilities are resolved with `cn`, so the `class` you pass can override the variants.
 */
export function variants<V extends VariantMap>(config: VariantsConfig<V>) {
  return (props: Selection<V> & { class?: ClassValue } = {}): string => {
    const picked: Record<string, string | undefined> = {};
    const classes: ClassValue[] = [config.base];
    for (const name of Object.keys(config.variants)) {
      const option = (props as Record<string, string | undefined>)[name] ?? (config.defaultVariants as Record<string, string | undefined> | undefined)?.[name];
      picked[name] = option;
      if (option !== undefined) classes.push(config.variants[name]![option]);
    }
    for (const { class: extra, ...when } of config.compoundVariants ?? []) {
      if (Object.entries(when).every(([name, option]) => picked[name] === option)) classes.push(extra);
    }
    classes.push(props.class);
    return cn(...classes);
  };
}
