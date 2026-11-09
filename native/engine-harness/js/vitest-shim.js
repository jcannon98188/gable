// A vitest-compatible test runtime for running Gable's suites inside an
// embedded engine (the Gable engine or the interim QuickJS-NG engine) where
// vitest itself cannot run: vitest needs Node, a module runner and worker
// RPC. The bundler aliases `vitest` to this file. It implements the subset of
// vitest's API that the in-scope suites use, with vitest's semantics: the
// same suite run in Node through this shim must give the same outcome as
// under vitest (the runner checks that with `--runtime node`).
//
// Results are printed one per line through console.log:
//   @@gable-test {"file","name","status":"pass"|"fail"|"skip","error"?}
//   @@gable-done {"pass","fail","skip"}

/* ------------------------------------------------------------------ */
/* Timers captured before any test can fake them                       */
/* ------------------------------------------------------------------ */

const realTimers = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setImmediate: globalThis.setImmediate,
  clearImmediate: globalThis.clearImmediate,
  Date: globalThis.Date,
  performanceNow: globalThis.performance && globalThis.performance.now ? globalThis.performance.now.bind(globalThis.performance) : null,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
};

const yieldMacrotask = () => new Promise((r) => realTimers.setTimeout.call(globalThis, r, 0));

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function fmt(v, depth = 0, seen = new Set()) {
  if (typeof v === "string") return depth === 0 ? JSON.stringify(v) : JSON.stringify(v);
  if (typeof v === "bigint") return `${v}n`;
  if (typeof v === "symbol") return v.toString();
  if (typeof v === "function") return isMock(v) ? `[MockFunction ${v.getMockName()}]` : `[Function ${v.name || "anonymous"}]`;
  if (v === null || typeof v !== "object") return Object.is(v, -0) ? "-0" : String(v);
  if (isAsymmetric(v)) return v.toString();
  if (seen.has(v)) return "[Circular]";
  if (depth > 4) return Array.isArray(v) ? "[Array]" : "[Object]";
  seen.add(v);
  try {
    if (v instanceof Error) return `[${v.name}: ${v.message}]`;
    if (v instanceof realTimers.Date) return `Date(${isNaN(v.getTime()) ? "Invalid" : v.toISOString()})`;
    if (v instanceof RegExp) return String(v);
    if (Array.isArray(v)) return `[${v.map((x) => fmt(x, depth + 1, seen)).join(", ")}]`;
    if (v instanceof Map) return `Map {${[...v].map(([k, x]) => `${fmt(k, depth + 1, seen)} => ${fmt(x, depth + 1, seen)}`).join(", ")}}`;
    if (v instanceof Set) return `Set {${[...v].map((x) => fmt(x, depth + 1, seen)).join(", ")}}`;
    const name = v.constructor && v.constructor !== Object && typeof v.constructor.name === "string" ? v.constructor.name + " " : "";
    const keys = Object.keys(v);
    const body = keys.slice(0, 30).map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${fmt(v[k], depth + 1, seen)}`);
    if (keys.length > 30) body.push("...");
    return `${name}{${body.join(", ")}}`;
  } catch (e) {
    return "[unprintable]";
  } finally {
    seen.delete(v);
  }
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

/* ------------------------------------------------------------------ */
/* Equality (jest/vitest `equals`)                                     */
/* ------------------------------------------------------------------ */

const ASYM = Symbol.for("gable-shim.asymmetric");
const isAsymmetric = (v) => v !== null && typeof v === "object" && v[ASYM] === true;

function typeTag(v) {
  return Object.prototype.toString.call(v);
}

function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function ownEnumKeys(obj) {
  const keys = Object.keys(obj);
  for (const s of Object.getOwnPropertySymbols(obj)) {
    if (Object.getOwnPropertyDescriptor(obj, s).enumerable) keys.push(s);
  }
  return keys;
}

// strict: toStrictEqual semantics (undefined properties count, sparseness
// and class identity are checked).
function equals(a, b, strict = false, aStack = [], bStack = []) {
  if (isAsymmetric(a) && !isAsymmetric(b)) return a.asymmetricMatch(b);
  if (isAsymmetric(b) && !isAsymmetric(a)) return b.asymmetricMatch(a);
  if (a instanceof Error && b instanceof Error) {
    if (a.name !== b.name || a.message !== b.message) return false;
    if (!equals(a.cause, b.cause, strict, aStack, bStack)) return false;
    if (typeof AggregateError === "function" && a instanceof AggregateError && b instanceof AggregateError && !equals(a.errors, b.errors, strict, aStack, bStack)) return false;
    return equalsObjectProps(a, b, strict, aStack, bStack, true);
  }
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (typeof a === "function" && typeof b === "function") return false;
    return false;
  }
  const tag = typeTag(a);
  if (tag !== typeTag(b)) return false;
  switch (tag) {
    case "[object Boolean]":
    case "[object String]":
    case "[object Number]":
      if (typeof a !== typeof b) return false;
      return Object.is(a.valueOf(), b.valueOf());
    case "[object Date]": {
      const x = +a, y = +b;
      return x === y || (Number.isNaN(x) && Number.isNaN(y));
    }
    case "[object RegExp]":
      return a.source === b.source && a.flags === b.flags;
  }
  const len = aStack.length;
  for (let i = len - 1; i >= 0; i--) if (aStack[i] === a) return bStack[i] === b;
  aStack.push(a);
  bStack.push(b);
  try {
    if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      for (const [k, v] of a) {
        if (b.has(k)) {
          if (!equals(v, b.get(k), strict, aStack, bStack)) return false;
        } else {
          let found = false;
          for (const [k2, v2] of b) {
            if (equals(k, k2, strict, aStack, bStack) && equals(v, v2, strict, aStack, bStack)) { found = true; break; }
          }
          if (!found) return false;
        }
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      for (const v of a) {
        if (b.has(v)) continue;
        let found = false;
        for (const v2 of b) if (equals(v, v2, strict, aStack, bStack)) { found = true; break; }
        if (!found) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && !(a instanceof DataView)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
      return true;
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (strict && hasKey(a, i) !== hasKey(b, i)) return false;
        if (!equals(a[i], b[i], strict, aStack, bStack)) return false;
      }
      // extra non-index keys
      return equalsObjectProps(a, b, strict, aStack, bStack, false, true);
    }
    return equalsObjectProps(a, b, strict, aStack, bStack, false);
  } finally {
    aStack.pop();
    bStack.pop();
  }
}

function equalsObjectProps(a, b, strict, aStack, bStack, errorMode, skipIndices = false) {
  const filter = (k) => !(skipIndices && typeof k === "string" && /^\d+$/.test(k)) && !(errorMode && (k === "stack" || k === "message" || k === "name" || k === "cause"));
  const ka = ownEnumKeys(a).filter(filter);
  const kb = ownEnumKeys(b).filter(filter);
  if (strict) {
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!hasKey(b, k)) return false;
      if (!equals(a[k], b[k], strict, aStack, bStack)) return false;
    }
    return true;
  }
  // Non-strict: properties whose value is undefined are ignored.
  const da = ka.filter((k) => a[k] !== undefined);
  const db = kb.filter((k) => b[k] !== undefined);
  if (da.length !== db.length) return false;
  for (const k of da) {
    if (!(k in b) && !hasKey(b, k)) return false;
    if (!equals(a[k], b[k], strict, aStack, bStack)) return false;
  }
  return true;
}

// toMatchObject: `expected` is a recursive subset of `actual`.
function subsetEquals(actual, expected, seen = new WeakMap()) {
  if (isAsymmetric(expected)) return expected.asymmetricMatch(actual);
  if (expected === null || typeof expected !== "object" || expected instanceof Date || expected instanceof RegExp || expected instanceof Map || expected instanceof Set) {
    return equals(actual, expected);
  }
  if (actual === null || typeof actual !== "object") return false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((e, i) => subsetEquals(actual[i], e, seen));
  }
  if (seen.get(expected) === actual) return true;
  seen.set(expected, actual);
  for (const k of ownEnumKeys(expected)) {
    if (!(k in actual)) return false;
    if (!subsetEquals(actual[k], expected[k], seen)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Asymmetric matchers                                                 */
/* ------------------------------------------------------------------ */

function asym(name, match, describe, inverse = false) {
  return {
    [ASYM]: true,
    asymmetricMatch: (v) => (inverse ? !match(v) : match(v)),
    toString: () => `${inverse ? "Not" : ""}${name}${describe ? ` ${describe}` : ""}`,
    toJSON() { return this.toString(); },
  };
}

function anyMatch(ctor, v) {
  if (ctor === String) return typeof v === "string" || v instanceof String;
  if (ctor === Number) return typeof v === "number" || v instanceof Number;
  if (ctor === Boolean) return typeof v === "boolean" || v instanceof Boolean;
  if (ctor === Function) return typeof v === "function";
  if (ctor === BigInt) return typeof v === "bigint";
  if (ctor === Symbol) return typeof v === "symbol";
  if (ctor === Object) return v !== null && typeof v === "object";
  return v instanceof ctor;
}

function makeAsymmetrics(inverse) {
  return {
    any: (ctor) => asym("Any", (v) => anyMatch(ctor, v), ctor && ctor.name, inverse),
    anything: () => asym("Anything", (v) => v !== null && v !== undefined, "", inverse),
    objectContaining: (obj) => asym("ObjectContaining", (v) => v !== null && v !== undefined && Object.keys(obj).every((k) => k in Object(v) && equals(v[k], obj[k])), fmt(obj), inverse),
    arrayContaining: (arr) => asym("ArrayContaining", (v) => Array.isArray(v) && arr.every((e) => v.some((x) => equals(x, e))), fmt(arr), inverse),
    stringContaining: (s) => asym("StringContaining", (v) => typeof v === "string" && v.includes(s), JSON.stringify(s), inverse),
    stringMatching: (re) => asym("StringMatching", (v) => typeof v === "string" && (typeof re === "string" ? v.includes(re) : re.test(v)), String(re), inverse),
    closeTo: (n, digits = 2) => asym("CloseTo", (v) => typeof v === "number" && Math.abs(v - n) < Math.pow(10, -digits) / 2, String(n), inverse),
  };
}

/* ------------------------------------------------------------------ */
/* expect                                                              */
/* ------------------------------------------------------------------ */

let assertionCount = 0;
let expectedAssertions = null;
let requireAssertions = false;

function getPath(obj, path) {
  const parts = Array.isArray(path) ? path : String(path).replace(/\[(\w+)\]/g, ".$1").split(".").filter((p) => p !== "");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || !(p in Object(cur))) return { found: false };
    cur = cur[p];
  }
  return { found: true, value: cur };
}

function throwMatches(err, expected) {
  if (expected === undefined) return true;
  const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
  if (typeof expected === "string") return String(message).includes(expected);
  if (expected instanceof RegExp) return expected.test(String(message));
  if (typeof expected === "function") return err instanceof expected;
  if (isAsymmetric(expected)) return expected.asymmetricMatch(err);
  if (expected && typeof expected === "object") {
    if (expected instanceof Error) return message === expected.message;
    return subsetEquals(err, expected);
  }
  return false;
}

function calledWithMatch(calls, args) {
  return calls.some((c) => equals(c, args));
}

const matchers = {
  toBe: (a, e) => [Object.is(a, e), () => `expected ${fmt(a)} to be ${fmt(e)}${typeof a === "object" && a !== null && equals(a, e) ? " (deeply equal but not the same reference)" : ""}`],
  toEqual: (a, e) => [equals(a, e), () => `expected ${fmt(a)} to deeply equal ${fmt(e)}`],
  toStrictEqual: (a, e) => [equals(a, e, true), () => `expected ${fmt(a)} to strictly equal ${fmt(e)}`],
  toMatchObject: (a, e) => [subsetEquals(a, e), () => `expected ${fmt(a)} to match object ${fmt(e)}`],
  toBeTruthy: (a) => [!!a, () => `expected ${fmt(a)} to be truthy`],
  toBeFalsy: (a) => [!a, () => `expected ${fmt(a)} to be falsy`],
  toBeNull: (a) => [a === null, () => `expected ${fmt(a)} to be null`],
  toBeUndefined: (a) => [a === undefined, () => `expected ${fmt(a)} to be undefined`],
  toBeDefined: (a) => [a !== undefined, () => `expected ${fmt(a)} to be defined`],
  toBeNaN: (a) => [Number.isNaN(a), () => `expected ${fmt(a)} to be NaN`],
  toBeTypeOf: (a, t) => [typeof a === t, () => `expected ${fmt(a)} to be type of ${t}`],
  toBeInstanceOf: (a, c) => [a instanceof c, () => `expected ${fmt(a)} to be an instance of ${c && c.name}`],
  toBeGreaterThan: (a, n) => [a > n, () => `expected ${fmt(a)} to be greater than ${fmt(n)}`],
  toBeGreaterThanOrEqual: (a, n) => [a >= n, () => `expected ${fmt(a)} to be greater than or equal to ${fmt(n)}`],
  toBeLessThan: (a, n) => [a < n, () => `expected ${fmt(a)} to be less than ${fmt(n)}`],
  toBeLessThanOrEqual: (a, n) => [a <= n, () => `expected ${fmt(a)} to be less than or equal to ${fmt(n)}`],
  toBeCloseTo: (a, n, digits = 2) => [Math.abs(a - n) < Math.pow(10, -digits) / 2 || a === n, () => `expected ${fmt(a)} to be close to ${fmt(n)}`],
  toBeOneOf: (a, list) => [list.some((x) => equals(a, x)), () => `expected ${fmt(a)} to be one of ${fmt(list)}`],
  toSatisfy: (a, fn) => [!!fn(a), () => `expected ${fmt(a)} to satisfy the predicate`],
  toHaveLength: (a, n) => [a !== null && a !== undefined && a.length === n, () => `expected ${fmt(a)} to have length ${n} but got ${a && a.length}`],
  toContain: (a, item) => {
    let ok;
    if (typeof a === "string") ok = a.includes(String(item));
    else if (a && typeof a.contains === "function" && typeof item === "string" && !Array.isArray(a)) ok = a.contains(item);
    else if (a && typeof a[Symbol.iterator] === "function") ok = [...a].some((x) => x === item || Object.is(x, item));
    else ok = false;
    return [ok, () => `expected ${fmt(a)} to contain ${fmt(item)}`];
  },
  toContainEqual: (a, item) => [a && [...a].some((x) => equals(x, item)), () => `expected ${fmt(a)} to contain an item equal to ${fmt(item)}`],
  toMatch: (a, e) => [typeof a === "string" && (typeof e === "string" ? a.includes(e) : e.test(a)), () => `expected ${fmt(a)} to match ${fmt(e)}`],
  toHaveProperty: (a, path, ...rest) => {
    const r = a === null || a === undefined ? { found: false } : getPath(a, path);
    const ok = r.found && (rest.length === 0 || equals(r.value, rest[0]));
    return [ok, () => `expected ${fmt(a)} to have property ${fmt(path)}${rest.length ? ` equal to ${fmt(rest[0])}` : ""}`];
  },
  toThrow: (a, expected) => {
    // `a` is either a function (sync) or, under .rejects, the reason.
    if (typeof a === "object" && a !== null && a[REJECTED]) {
      const err = a.value;
      return [throwMatches(err, expected), () => `expected rejection ${fmt(err)} to match ${fmt(expected)}`];
    }
    if (typeof a !== "function") return [false, () => `expected a function, got ${fmt(a)}`];
    let threw = false, err;
    try { a(); } catch (e) { threw = true; err = e; }
    if (!threw) return [false, () => `expected function to throw${expected !== undefined ? ` ${fmt(expected)}` : ""}`, true];
    return [throwMatches(err, expected), () => `expected thrown ${fmt(err)} to match ${fmt(expected)}`];
  },
  toHaveBeenCalled: (m) => [mockOf(m).calls.length > 0, () => `expected ${fmt(m)} to have been called`],
  toHaveBeenCalledOnce: (m) => [mockOf(m).calls.length === 1, () => `expected ${fmt(m)} to have been called once, got ${mockOf(m).calls.length}`],
  toHaveBeenCalledTimes: (m, n) => [mockOf(m).calls.length === n, () => `expected ${fmt(m)} to have been called ${n} times, got ${mockOf(m).calls.length}`],
  toHaveBeenCalledWith: (m, ...args) => [calledWithMatch(mockOf(m).calls, args), () => `expected ${fmt(m)} to have been called with ${fmt(args)}; calls: ${fmt(mockOf(m).calls)}`],
  toHaveBeenLastCalledWith: (m, ...args) => {
    const c = mockOf(m).calls;
    return [c.length > 0 && equals(c[c.length - 1], args), () => `expected last call ${fmt(c[c.length - 1])} to equal ${fmt(args)}`];
  },
  toHaveBeenNthCalledWith: (m, n, ...args) => {
    const c = mockOf(m).calls;
    return [c.length >= n && equals(c[n - 1], args), () => `expected call ${n} ${fmt(c[n - 1])} to equal ${fmt(args)}`];
  },
  toHaveReturned: (m) => [mockOf(m).results.some((r) => r.type === "return"), () => `expected ${fmt(m)} to have returned`],
  toHaveReturnedWith: (m, v) => [mockOf(m).results.some((r) => r.type === "return" && equals(r.value, v)), () => `expected ${fmt(m)} to have returned ${fmt(v)}`],
  toHaveReturnedTimes: (m, n) => [mockOf(m).results.filter((r) => r.type === "return").length === n, () => `expected ${fmt(m)} to have returned ${n} times`],
};
matchers.toThrowError = matchers.toThrow;
matchers.toBeCalled = matchers.toHaveBeenCalled;
matchers.toBeCalledTimes = matchers.toHaveBeenCalledTimes;
matchers.toBeCalledWith = matchers.toHaveBeenCalledWith;

const REJECTED = Symbol("rejected");

function mockOf(m) {
  if (!isMock(m)) throw new AssertionError(`${fmt(m)} is not a spy or a call to a spy`);
  return m.mock;
}

function check(name, args, actual, negate) {
  assertionCount++;
  const m = matchers[name];
  const [pass, message, hardFail] = m(actual, ...args);
  if (negate ? pass && !hardFail : !pass) {
    const msg = message();
    throw new AssertionError(negate ? msg.replace(/^expected (.*?) to /, "expected $1 not to ") : msg);
  }
}

function expect(actual, message) {
  const build = (negate) => {
    const api = {};
    for (const name of Object.keys(matchers)) api[name] = (...args) => {
      try {
        check(name, args, actual, negate);
      } catch (e) {
        if (message && e instanceof AssertionError) e.message = `${message}: ${e.message}`;
        throw e;
      }
    };
    return api;
  };
  const api = build(false);
  api.not = build(true);
  const settle = (mode, negate) => {
    const out = {};
    for (const name of Object.keys(matchers)) out[name] = async (...args) => {
      let value, rejected = false;
      try { value = await actual; } catch (e) { rejected = true; value = e; }
      if (mode === "resolves" && rejected) throw new AssertionError(`promise rejected with ${fmt(value)} instead of resolving`);
      if (mode === "rejects" && !rejected) throw new AssertionError(`promise resolved with ${fmt(value)} instead of rejecting`);
      const subject = mode === "rejects" && (name === "toThrow" || name === "toThrowError") ? { [REJECTED]: true, value } : value;
      check(name, args, subject, negate);
    };
    return out;
  };
  api.resolves = settle("resolves", false);
  api.resolves.not = settle("resolves", true);
  api.rejects = settle("rejects", false);
  api.rejects.not = settle("rejects", true);
  return api;
}
Object.assign(expect, makeAsymmetrics(false));
expect.not = makeAsymmetrics(true);
expect.assertions = (n) => { expectedAssertions = n; };
expect.hasAssertions = () => { requireAssertions = true; };
expect.extend = (defs) => {
  for (const [name, fn] of Object.entries(defs)) {
    matchers[name] = (actual, ...args) => {
      const r = fn.call({ equals, isNot: false }, actual, ...args);
      return [r.pass, () => (typeof r.message === "function" ? r.message() : String(r.message))];
    };
    expect[name] = (...args) => asym(name, (v) => fn.call({ equals }, v, ...args).pass, fmt(args));
  }
};
expect.soft = expect;
expect.unreachable = (msg) => { throw new AssertionError(msg || "expected not to be reached"); };
expect.getState = () => ({ assertionCalls: assertionCount, currentTestName: currentTest ? currentTest.fullName : undefined });

export { expect };
export const assert = (cond, message) => { if (!cond) throw new AssertionError(message || "assertion failed"); };

/* expectTypeOf / assertType: compile-time only, so runtime no-ops. */
const typeProxy = new Proxy(function () {}, {
  get: (_t, key) => (key === Symbol.toPrimitive ? () => "expectTypeOf" : typeProxy),
  apply: () => typeProxy,
});
export const expectTypeOf = () => typeProxy;
export const assertType = () => {};

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const MOCK = Symbol.for("gable-shim.mock");
const allMocks = new Set();
const isMock = (f) => typeof f === "function" && f[MOCK] === true;

function fn(impl) {
  let implementation = impl;
  const onces = [];
  let name = "vi.fn()";
  let restore = null;
  const state = { calls: [], results: [], instances: [], contexts: [], invocationCallOrder: [], lastCall: undefined, settledResults: [] };
  const mock = function (...args) {
    state.calls.push(args);
    state.lastCall = args;
    state.contexts.push(this);
    state.instances.push(new.target ? this : undefined);
    state.invocationCallOrder.push(++callOrder);
    const result = { type: "incomplete", value: undefined };
    state.results.push(result);
    const f = onces.length ? onces.shift() : implementation;
    try {
      let value;
      if (f) value = new.target ? Reflect.construct(f, args, new.target) : f.apply(this, args);
      result.type = "return";
      result.value = value;
      if (value && typeof value.then === "function") {
        const settled = { type: "incomplete", value: undefined };
        state.settledResults.push(settled);
        value.then((v) => { settled.type = "fulfilled"; settled.value = v; }, (e) => { settled.type = "rejected"; settled.value = e; });
      }
      return value;
    } catch (e) {
      result.type = "throw";
      result.value = e;
      throw e;
    }
  };
  Object.defineProperty(mock, MOCK, { value: true });
  mock.mock = state;
  mock.getMockName = () => name;
  mock.mockName = (n) => { name = n; return mock; };
  mock.getMockImplementation = () => implementation;
  mock.mockImplementation = (f) => { implementation = f; return mock; };
  mock.mockImplementationOnce = (f) => { onces.push(f); return mock; };
  mock.mockReturnValue = (v) => mock.mockImplementation(() => v);
  mock.mockReturnValueOnce = (v) => mock.mockImplementationOnce(() => v);
  mock.mockResolvedValue = (v) => mock.mockImplementation(() => Promise.resolve(v));
  mock.mockResolvedValueOnce = (v) => mock.mockImplementationOnce(() => Promise.resolve(v));
  mock.mockRejectedValue = (v) => mock.mockImplementation(() => Promise.reject(v));
  mock.mockRejectedValueOnce = (v) => mock.mockImplementationOnce(() => Promise.reject(v));
  mock.mockReturnThis = () => mock.mockImplementation(function () { return this; });
  mock.mockClear = () => {
    for (const k of ["calls", "results", "instances", "contexts", "invocationCallOrder", "settledResults"]) state[k].length = 0;
    state.lastCall = undefined;
    return mock;
  };
  mock.mockReset = () => { mock.mockClear(); implementation = impl; onces.length = 0; return mock; };
  mock.mockRestore = () => { mock.mockReset(); if (restore) restore(); return mock; };
  mock.withImplementation = (f, cb) => {
    const prev = implementation;
    implementation = f;
    const r = cb();
    if (r && typeof r.then === "function") return r.finally(() => { implementation = prev; });
    implementation = prev;
    return r;
  };
  mock._setRestore = (r) => { restore = r; };
  allMocks.add(mock);
  return mock;
}
let callOrder = 0;

function spyOn(obj, key, access) {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  let ownerDesc = desc;
  for (let o = obj; !ownerDesc && o; o = Object.getPrototypeOf(o)) ownerDesc = Object.getOwnPropertyDescriptor(o, key);
  if (!ownerDesc) throw new Error(`${String(key)} does not exist`);
  if (access === "get" || access === "set") {
    const original = ownerDesc[access];
    const m = fn(original);
    Object.defineProperty(obj, key, { ...ownerDesc, [access]: m, configurable: true });
    m._setRestore(() => { if (desc) Object.defineProperty(obj, key, desc); else delete obj[key]; });
    return m;
  }
  const original = ownerDesc.value;
  if (isMock(original)) return original;
  const m = fn(original);
  m.mockName(String(key));
  Object.defineProperty(obj, key, { value: m, writable: true, configurable: true, enumerable: desc ? desc.enumerable : false });
  m._setRestore(() => { if (desc) Object.defineProperty(obj, key, desc); else delete obj[key]; });
  return m;
}

/* ------------------------------------------------------------------ */
/* Fake timers                                                         */
/* ------------------------------------------------------------------ */

class FakeClock {
  constructor(now) {
    this.now = now;
    this.startPerf = 0;
    this.timers = new Map();
    this.nextId = 1;
    this.loops = 0;
  }
  add(fn, delay, args, interval, kind) {
    const id = this.nextId++;
    delay = Math.max(0, Math.floor(Number(delay) || 0));
    this.timers.set(id, { id, fn, args, at: this.now + delay, interval: interval ? Math.max(1, delay) : 0, kind, order: id });
    return id;
  }
  next(limit) {
    let best = null;
    for (const t of this.timers.values()) {
      if (t.at > limit) continue;
      if (!best || t.at < best.at || (t.at === best.at && t.order < best.order)) best = t;
    }
    return best;
  }
  fire(t) {
    this.now = Math.max(this.now, t.at);
    if (t.interval) {
      t.at += t.interval;
      t.order = this.nextId++;
    } else {
      this.timers.delete(t.id);
    }
    if (typeof t.fn === "function") t.fn.apply(globalThis, t.kind === "raf" ? [this.now - this.startPerf] : t.args);
  }
  tick(ms) {
    const target = this.now + Math.max(0, Number(ms) || 0);
    let guard = 0;
    for (let t = this.next(target); t; t = this.next(target)) {
      if (++guard > 100000) throw new Error("Aborting after running 100000 timers, assuming an infinite loop!");
      this.fire(t);
    }
    this.now = target;
  }
  async tickAsync(ms) {
    const target = this.now + Math.max(0, Number(ms) || 0);
    let guard = 0;
    await yieldMacrotask();
    for (let t = this.next(target); t; t = this.next(target)) {
      if (++guard > 100000) throw new Error("Aborting after running 100000 timers, assuming an infinite loop!");
      this.fire(t);
      await yieldMacrotask();
    }
    this.now = target;
  }
  runAll() {
    for (let i = 0; i < 100000; i++) {
      const t = this.next(Infinity);
      if (!t) return;
      this.fire(t);
    }
    throw new Error("Aborting after running 100000 timers, assuming an infinite loop!");
  }
  async runAllAsync() {
    for (let i = 0; i < 100000; i++) {
      await yieldMacrotask();
      const t = this.next(Infinity);
      if (!t) return;
      this.fire(t);
    }
    throw new Error("Aborting after running 100000 timers, assuming an infinite loop!");
  }
  runOnlyPending() {
    const pending = [...this.timers.values()].sort((a, b) => a.at - b.at || a.order - b.order);
    for (const t of pending) if (this.timers.has(t.id)) this.fire(t);
  }
}

let clock = null;
let fakeDateNow = null; // setSystemTime without fake timers

function makeFakeDate(getNow) {
  const RealDate = realTimers.Date;
  function FakeDate(...args) {
    if (!new.target) return new RealDate(getNow()).toString();
    if (args.length === 0) return Reflect.construct(RealDate, [getNow()], new.target);
    return Reflect.construct(RealDate, args, new.target);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => getNow();
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  Object.defineProperty(FakeDate, "name", { value: "Date" });
  return FakeDate;
}

function installFakeTimers(opts = {}) {
  const now = fakeDateNow !== null ? fakeDateNow : realTimers.Date.now();
  if (clock) uninstallFakeTimers();
  const toFake = opts.toFake || ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"];
  if (opts.now !== undefined) clock = new FakeClock(+opts.now);
  else clock = new FakeClock(now);
  const c = clock;
  c.startPerf = c.now - (realTimers.performanceNow ? realTimers.performanceNow() : 0);
  const has = (n) => toFake.includes(n);
  if (has("setTimeout")) globalThis.setTimeout = (f, d, ...a) => c.add(f, d, a, false, "timeout");
  if (has("clearTimeout")) globalThis.clearTimeout = (id) => { c.timers.delete(id); };
  if (has("setInterval")) globalThis.setInterval = (f, d, ...a) => c.add(f, d, a, true, "interval");
  if (has("clearInterval")) globalThis.clearInterval = (id) => { c.timers.delete(id); };
  if (has("setImmediate") && realTimers.setImmediate) globalThis.setImmediate = (f, ...a) => c.add(f, 0, a, false, "immediate");
  if (has("clearImmediate") && realTimers.clearImmediate) globalThis.clearImmediate = (id) => { c.timers.delete(id); };
  if (has("requestAnimationFrame") && realTimers.requestAnimationFrame) globalThis.requestAnimationFrame = (f) => c.add(f, 16 - ((c.now - c.startPerf) % 16), [], false, "raf");
  if (has("cancelAnimationFrame") && realTimers.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => { c.timers.delete(id); };
  if (has("Date")) globalThis.Date = makeFakeDate(() => c.now);
  if (has("performance") && globalThis.performance && realTimers.performanceNow) {
    try {
      Object.defineProperty(globalThis.performance, "now", { value: () => c.now - c.startPerf, configurable: true, writable: true });
    } catch {}
  }
}

function uninstallFakeTimers() {
  globalThis.setTimeout = realTimers.setTimeout;
  globalThis.clearTimeout = realTimers.clearTimeout;
  globalThis.setInterval = realTimers.setInterval;
  globalThis.clearInterval = realTimers.clearInterval;
  if (realTimers.setImmediate) globalThis.setImmediate = realTimers.setImmediate;
  if (realTimers.clearImmediate) globalThis.clearImmediate = realTimers.clearImmediate;
  if (realTimers.requestAnimationFrame) globalThis.requestAnimationFrame = realTimers.requestAnimationFrame;
  if (realTimers.cancelAnimationFrame) globalThis.cancelAnimationFrame = realTimers.cancelAnimationFrame;
  globalThis.Date = fakeDateNow !== null ? makeFakeDate(() => fakeDateNow) : realTimers.Date;
  if (globalThis.performance && realTimers.performanceNow) {
    try {
      Object.defineProperty(globalThis.performance, "now", { value: realTimers.performanceNow, configurable: true, writable: true });
    } catch {}
  }
  clock = null;
}

const needClock = () => {
  if (!clock) throw new Error("A function to advance timers was called but the timers APIs are not mocked. Call `vi.useFakeTimers()` in the test file first.");
  return clock;
};

/* ------------------------------------------------------------------ */
/* vi                                                                  */
/* ------------------------------------------------------------------ */

const stubbedGlobals = new Map();
let fakeTimerConfig = undefined;

export const vi = {
  fn,
  spyOn,
  isMockFunction: isMock,
  mocked: (x) => x,
  hoisted: (f) => f(),
  clearAllMocks: () => { for (const m of allMocks) m.mockClear(); return vi; },
  resetAllMocks: () => { for (const m of allMocks) m.mockReset(); return vi; },
  restoreAllMocks: () => { for (const m of allMocks) m.mockRestore(); return vi; },
  stubGlobal: (name, value) => {
    if (!stubbedGlobals.has(name)) stubbedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
    return vi;
  },
  unstubAllGlobals: () => {
    for (const [name, desc] of stubbedGlobals) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete globalThis[name];
    }
    stubbedGlobals.clear();
    return vi;
  },
  useFakeTimers: (opts) => { installFakeTimers(opts || fakeTimerConfig); return vi; },
  useRealTimers: () => { if (clock) uninstallFakeTimers(); return vi; },
  isFakeTimers: () => clock !== null,
  setConfig: () => vi,
  advanceTimersByTime: (ms) => { needClock().tick(ms); return vi; },
  advanceTimersByTimeAsync: async (ms) => { await needClock().tickAsync(ms); return vi; },
  advanceTimersToNextTimer: (steps = 1) => {
    const c = needClock();
    for (let i = 0; i < steps; i++) { const t = c.next(Infinity); if (!t) break; c.tick(t.at - c.now); }
    return vi;
  },
  advanceTimersToNextTimerAsync: async (steps = 1) => {
    const c = needClock();
    for (let i = 0; i < steps; i++) { const t = c.next(Infinity); if (!t) break; await c.tickAsync(t.at - c.now); }
    return vi;
  },
  advanceTimersToNextFrame: () => { const c = needClock(); c.tick(16 - ((c.now - c.startPerf) % 16)); return vi; },
  runAllTimers: () => { needClock().runAll(); return vi; },
  runAllTimersAsync: async () => { await needClock().runAllAsync(); return vi; },
  runOnlyPendingTimers: () => { needClock().runOnlyPending(); return vi; },
  runOnlyPendingTimersAsync: async () => { needClock().runOnlyPending(); await yieldMacrotask(); return vi; },
  runAllTicks: () => vi,
  clearAllTimers: () => { if (clock) clock.timers.clear(); return vi; },
  getTimerCount: () => (clock ? clock.timers.size : 0),
  setSystemTime: (t) => {
    const ms = t instanceof realTimers.Date ? t.getTime() : typeof t === "object" && t && "epochMilliseconds" in t ? t.epochMilliseconds : new realTimers.Date(t).getTime();
    if (clock) clock.now = ms;
    else { fakeDateNow = ms; globalThis.Date = makeFakeDate(() => fakeDateNow); }
    return vi;
  },
  getMockedSystemTime: () => (clock ? new realTimers.Date(clock.now) : fakeDateNow !== null ? new realTimers.Date(fakeDateNow) : null),
  getRealSystemTime: () => realTimers.Date.now(),
  waitFor: async (cb, opts = {}) => {
    const timeout = typeof opts === "number" ? opts : opts.timeout ?? 1000;
    const interval = opts.interval ?? 50;
    const start = realTimers.Date.now();
    for (;;) {
      try { return await cb(); } catch (e) {
        if (realTimers.Date.now() - start >= timeout) throw e;
      }
      await new Promise((r) => realTimers.setTimeout.call(globalThis, r, interval));
    }
  },
  waitUntil: async (cb, opts = {}) => {
    const timeout = typeof opts === "number" ? opts : opts.timeout ?? 1000;
    const interval = opts.interval ?? 50;
    const start = realTimers.Date.now();
    for (;;) {
      const v = await cb();
      if (v) return v;
      if (realTimers.Date.now() - start >= timeout) throw new Error("Timed out in waitUntil!");
      await new Promise((r) => realTimers.setTimeout.call(globalThis, r, interval));
    }
  },
};
export const vitest = vi;

/* ------------------------------------------------------------------ */
/* Collection                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT = 30000;

function newSuite(name, parent, mode) {
  return { kind: "suite", name, parent, mode, children: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] };
}
const root = newSuite("", null, "run");
let collecting = root;
let hasOnly = false;
let currentTest = null;

function fullName(node) {
  const parts = [];
  for (let n = node; n && n !== root; n = n.parent) parts.unshift(n.name);
  return parts.join(" > ");
}

function formatTitle(title, args, index) {
  let i = 0;
  const vals = Array.isArray(args) ? args : [args];
  let out = String(title).replace(/%[sdifjoO#%]/g, (m) => {
    if (m === "%%") return "%";
    if (m === "%#") return String(index);
    const v = vals[i++];
    if (m === "%d" || m === "%i") return String(m === "%i" ? Math.trunc(Number(v)) : Number(v));
    if (m === "%f") return String(Number(v));
    if (m === "%s") return typeof v === "string" ? v : fmt(v);
    return fmt(v);
  });
  if (!Array.isArray(args) && args && typeof args === "object") {
    out = out.replace(/\$([\w.]+)/g, (m, path) => {
      const r = getPath(args, path);
      return r.found ? (typeof r.value === "string" ? r.value : fmt(r.value)) : m;
    });
  }
  return out;
}

function parseOptions(a, b) {
  // it(name, fn, timeout) | it(name, options, fn) | it(name, fn, options)
  if (typeof a === "function") return { fn: a, options: typeof b === "number" ? { timeout: b } : b || {} };
  if (a && typeof a === "object") return { fn: b, options: a };
  return { fn: undefined, options: {} };
}

function addTest(name, a, b, mode) {
  const { fn: body, options } = parseOptions(a, b);
  let m = mode;
  if (options.skip) m = "skip";
  if (options.only) m = "only";
  if (options.todo) m = "todo";
  if (!body && m !== "todo") m = "todo";
  if (m === "only") hasOnly = true;
  collecting.children.push({ kind: "test", name: String(name), parent: collecting, mode: m, fn: body, timeout: options.timeout ?? DEFAULT_TIMEOUT, fails: !!options.fails, retry: options.retry || 0 });
}

function addSuite(name, a, b, mode) {
  const { fn: body, options } = parseOptions(a, b);
  let m = mode;
  if (options.skip) m = "skip";
  if (options.only) m = "only";
  if (m === "only") hasOnly = true;
  const s = newSuite(String(name), collecting, m);
  collecting.children.push(s);
  const prev = collecting;
  collecting = s;
  try {
    if (body) {
      const r = body();
      if (r && typeof r.then === "function") throw new Error("async describe callbacks are not supported by the engine test shim");
    }
  } finally {
    collecting = prev;
  }
}

function withModifiers(add, defaultMode) {
  const make = (mode) => {
    const f = (name, a, b) => add(name, a, b, mode);
    f.each = (table, ...rest) => {
      if (Array.isArray(table) && rest.length && typeof table[0] === "string") {
        // tagged template form: header row then values
        const header = table.join("").split("|").map((s) => s.trim()).filter(Boolean);
        const rows = [];
        for (let i = 0; i < rest.length; i += header.length) {
          const row = {};
          header.forEach((h, j) => { row[h] = rest[i + j]; });
          rows.push(row);
        }
        table = rows;
      }
      return (name, a, b) => {
        const { fn: body, options } = parseOptions(a, b);
        table.forEach((row, i) => {
          const args = Array.isArray(row) ? row : [row];
          add(formatTitle(name, row, i), body ? () => body(...args) : undefined, options, mode);
        });
      };
    };
    f.for = (table) => (name, a, b) => {
      const { fn: body, options } = parseOptions(a, b);
      table.forEach((row, i) => add(formatTitle(name, row, i), body ? (ctx) => body(row, ctx) : undefined, options, mode));
    };
    return f;
  };
  const base = make(defaultMode);
  base.skip = make("skip");
  base.only = make("only");
  base.todo = make("todo");
  base.concurrent = base;
  base.sequential = base;
  base.skipIf = (cond) => (cond ? base.skip : base);
  base.runIf = (cond) => (cond ? base : base.skip);
  base.fails = (name, a, b) => {
    const { fn: body, options } = parseOptions(a, b);
    add(name, body, { ...options, fails: true }, defaultMode);
  };
  base.extend = () => base;
  return base;
}

export const it = withModifiers(addTest, "run");
export const test = it;
export const describe = withModifiers(addSuite, "run");
export const suite = describe;
export const beforeAll = (f) => { collecting.beforeAll.push(f); };
export const afterAll = (f) => { collecting.afterAll.push(f); };
export const beforeEach = (f) => { collecting.beforeEach.push(f); };
export const afterEach = (f) => { collecting.afterEach.push(f); };
let finishedHooks = null;
export const onTestFinished = (f) => { if (finishedHooks) finishedHooks.push(f); };
export const onTestFailed = () => {};
export const inject = () => undefined;

/* ------------------------------------------------------------------ */
/* Running                                                             */
/* ------------------------------------------------------------------ */

function withTimeout(promiseFn, ms, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = realTimers.setTimeout.call(globalThis, () => {
      if (done) return;
      done = true;
      reject(new Error(`${label} timed out in ${ms}ms`));
    }, ms);
    Promise.resolve()
      .then(promiseFn)
      .then(
        (v) => { if (!done) { done = true; realTimers.clearTimeout.call(globalThis, timer); resolve(v); } },
        (e) => { if (!done) { done = true; realTimers.clearTimeout.call(globalThis, timer); reject(e); } },
      );
  });
}

function errorText(e) {
  if (e && typeof e === "object") {
    const head = `${e.name || "Error"}: ${e.message}`;
    const stack = typeof e.stack === "string" ? e.stack.split("\n").filter((l) => /^\s+at /.test(l)).slice(0, 6).join("\n") : "";
    return stack ? `${head}\n${stack}` : head;
  }
  return String(e);
}

const results = { pass: 0, fail: 0, skip: 0 };
let fileName = "";

function report(test, status, error) {
  results[status]++;
  const line = { file: fileName, name: fullName(test), status };
  if (error !== undefined) line.error = errorText(error);
  console.log(`@@gable-test ${JSON.stringify(line)}`);
}

function suiteHasRunnable(s, parentOnly) {
  for (const c of s.children) {
    const only = parentOnly || c.mode === "only";
    if (c.kind === "test") {
      if (c.mode !== "skip" && c.mode !== "todo" && (!hasOnly || only)) return true;
    } else if (c.mode !== "skip" && suiteHasRunnable(c, only)) return true;
  }
  return false;
}

function eachHooks(node, kind) {
  const chain = [];
  for (let s = node.parent; s; s = s.parent) chain.unshift(s);
  return chain;
}

async function runTest(t) {
  currentTest = { fullName: fullName(t) };
  assertionCount = 0;
  expectedAssertions = null;
  requireAssertions = false;
  finishedHooks = [];
  const chain = eachHooks(t);
  const teardowns = [];
  let error;
  const context = {
    expect,
    task: { name: t.name },
    skip: () => { throw SKIP; },
    onTestFinished: (f) => finishedHooks.push(f),
    onTestFailed: () => {},
    signal: undefined,
  };
  try {
    for (const s of chain) {
      for (const h of s.beforeEach) {
        const r = await withTimeout(() => h(context), t.timeout, "beforeEach hook");
        if (typeof r === "function") teardowns.unshift(r);
      }
    }
    await withTimeout(() => t.fn(context), t.timeout, `Test "${t.name}"`);
    if (expectedAssertions !== null && assertionCount !== expectedAssertions) {
      throw new AssertionError(`expected number of assertions to be ${expectedAssertions}, but got ${assertionCount}`);
    }
    if (requireAssertions && assertionCount === 0) throw new AssertionError("expected any number of assertion, but got none");
  } catch (e) {
    error = e;
  }
  for (const f of teardowns) {
    try { await f(); } catch (e) { if (error === undefined) error = e; }
  }
  for (const s of [...chain].reverse()) {
    for (const h of [...s.afterEach].reverse()) {
      try { await withTimeout(() => h(context), t.timeout, "afterEach hook"); } catch (e) { if (error === undefined) error = e; }
    }
  }
  for (const f of finishedHooks.reverse()) {
    try { await f(); } catch (e) { if (error === undefined) error = e; }
  }
  finishedHooks = null;
  currentTest = null;
  return error;
}

const SKIP = { skip: true };

async function runSuite(s, skipped, parentOnly) {
  const active = !skipped && s.mode !== "skip" && suiteHasRunnable(s, parentOnly || s.mode === "only");
  const teardowns = [];
  let hookError;
  if (active) {
    for (const h of s.beforeAll) {
      try {
        const r = await h();
        if (typeof r === "function") teardowns.unshift(r);
      } catch (e) {
        hookError = e;
        break;
      }
    }
  }
  for (const c of s.children) {
    const only = parentOnly || s.mode === "only" || c.mode === "only";
    if (c.kind === "suite") {
      await runSuite(c, !active || hookError !== undefined, parentOnly || s.mode === "only");
      continue;
    }
    if (!active || c.mode === "skip" || c.mode === "todo" || (hasOnly && !only)) {
      report(c, "skip");
      continue;
    }
    if (hookError !== undefined) {
      report(c, "fail", hookError);
      continue;
    }
    let err;
    for (let attempt = 0; attempt <= c.retry; attempt++) {
      err = await runTest(c);
      if (err === undefined || err === SKIP) break;
    }
    if (err === SKIP) report(c, "skip");
    else if (c.fails) report(c, err === undefined ? "fail" : "pass", err === undefined ? new Error("expected test to fail") : undefined);
    else if (err === undefined) report(c, "pass");
    else report(c, "fail", err);
  }
  if (active) {
    for (const f of teardowns) { try { await f(); } catch (e) { console.log(`afterAll teardown failed: ${errorText(e)}`); } }
    for (const h of [...s.afterAll].reverse()) {
      try { await h(); } catch (e) { console.log(`afterAll hook failed in ${fullName(s) || fileName}: ${errorText(e)}`); results.fail++; }
    }
  }
}

// Called by the bundle entry after the test module has been evaluated.
export async function __runCollected(file) {
  fileName = file;
  try {
    await runSuite(root, false, false);
  } catch (e) {
    console.log(`@@gable-error ${JSON.stringify({ file, error: errorText(e) })}`);
    results.fail++;
  }
  if (clock) uninstallFakeTimers();
  console.log(`@@gable-done ${JSON.stringify({ file, ...results })}`);
}

export function __collectError(file, e) {
  fileName = file;
  console.log(`@@gable-error ${JSON.stringify({ file, error: errorText(e) })}`);
  console.log(`@@gable-done ${JSON.stringify({ file, pass: 0, fail: 1, skip: 0 })}`);
}
