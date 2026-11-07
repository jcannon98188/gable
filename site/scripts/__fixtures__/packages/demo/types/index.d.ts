import type { Shared } from "./shared.js";
export { Shared, sharedConst } from "./shared.js";
export * from "./more.js";
export * as ns from "./more.js";

/**
 * A counter. See {@link Shared} and {@link nothing|something else}.
 *
 * Longer remarks live in the second paragraph.
 *
 * @remarks Also a remarks tag.
 * @example
 * ```ts
 * const c = new Counter(1);
 * c.inc();
 * ```
 * @example
 * new Counter(2)
 * @see Shared
 */
export declare class Counter<T extends number = number> extends Base implements Shared {
    /** The id. */
    readonly id: string;
    static created: number;
    private secret;
    protected hidden: number;
    /** @internal */ internalField: number;
    /** Starts at `start`. */
    constructor(start: T);
    /**
     * Increments.
     * @param by - how much
     * @returns the new value
     */
    inc(by?: number): T;
    inc(by: string): string;
    get value(): T;
    set value(v: T);
    get readOnly(): number;
    [key: string]: unknown;
    /** @deprecated use inc */
    old(): void;
}
declare class Base {}

/**
 * Maps a value.
 * @typeParam T - input
 * @param value the input value
 * @param fn - mapper
 * @returns mapped
 */
export declare function map<T, U extends object>(value: T, fn: (v: T) => U): U;
/** Overloaded. */
export declare function pick(a: string): string;
export declare function pick(a: number): number;

/** @internal */
export declare function hiddenFn(): void;

/** @deprecated Use {@link Counter}. */
export type Old = Counter;
/** A union. */
export type Mode = "a" | "b";
/** Merged const and interface. */
export declare const Merged: { make(): Merged };
export interface Merged {
    n: number;
}
/** Merged function and namespace. */
export declare function fnNs(): void;
export declare namespace fnNs {
    /** Helper. */
    function helper(x: number): string;
    const flag: boolean;
}
/** Kinds. */
export declare enum Color {
    /** Red. */
    Red = 1,
    Green = 2
}
export declare const answer = 42;
export declare let counter: number;
export declare const undocumented: string;
export type { Mode as AliasMode };
