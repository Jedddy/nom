/**
 * Depth at which traversal stops and reports the remaining value by type alone.
 *
 * A response envelope wrapping a collection of records (`{ data: { items: [{ … }] } }`)
 * is fully described within four levels, which covers the payload shapes hosts map
 * without walking arbitrary object graphs.
 */
const MAX_DEPTH = 4;

/**
 * Largest key count for which key names are still emitted.
 *
 * Hand-written props and tool payloads stay far below 32 keys; anything wider is a
 * record keyed by data, so its key names are withheld per R7.
 */
const MAX_KEY_COUNT = 32;

/**
 * Longest key name that is still emitted.
 *
 * Longer than any declared field name in this SDK and shorter than a UUID (36) or an
 * email address, so identifier-shaped keys are described rather than enumerated.
 */
const MAX_KEY_LENGTH = 32;

/**
 * Number of leading array elements described individually.
 *
 * The size is always reported, so a small head sample is enough to show element shape
 * without walking a large collection.
 */
const MAX_ARRAY_SAMPLE = 3;

/**
 * Number of values inspected when inferring the value type of a keyed collection.
 *
 * Keyed collections are unbounded by definition, so the value type is inferred from a
 * bounded sample and reported as mixed when the sample disagrees.
 */
const MAX_VALUE_SAMPLE = 32;

/**
 * Total number of values described for one payload.
 *
 * Without it, {@link MAX_KEY_COUNT} keys at {@link MAX_DEPTH} levels would permit about
 * a million nodes per event; the cap keeps summarization proportional to a request.
 */
const MAX_NODES = 500;

/** Whether a payload is described structurally or forwarded verbatim. */
export type AgentPayloadMode = "structural" | "verbatim";

/** Value types reported for anything that is not walked further. */
export type AgentScalarType =
  "string" | "number" | "nan" | "boolean" | "bigint" | "symbol" | "function" | "null" | "undefined";

/** A value carrying no structure, described by its type alone. */
export interface AgentScalarSummary {
  readonly kind: "scalar";
  readonly type: AgentScalarType;
}

/** An array, described by its length and a bounded sample of its leading elements. */
export interface AgentArraySummary {
  readonly kind: "array";
  readonly size: number;
  /** Summaries for the first {@link MAX_ARRAY_SAMPLE} elements, at most. */
  readonly sample: readonly AgentValueSummary[];
}

/** A plain object narrow enough for its key names to be reported. */
export interface AgentObjectSummary {
  readonly kind: "object";
  readonly size: number;
  /** Own enumerable string keys mapped to the summary of their value. */
  readonly entries: Readonly<Record<string, AgentValueSummary>>;
}

/**
 * A plain object whose key names are withheld because they may carry data.
 *
 * Produced when the key count or any key length exceeds its bound, so an object keyed
 * by user identifiers reports how many keys it has instead of naming them.
 */
export interface AgentKeyedCollectionSummary {
  readonly kind: "keyed";
  readonly size: number;
  readonly keyType: "string" | "number" | "mixed";
  readonly valueType: string;
}

/** A non-plain value described by its constructor name. */
export interface AgentInstanceSummary {
  readonly kind: "instance";
  readonly className: string;
  /** Entry count, for the built-in keyed and set collections that report one. */
  readonly size?: number;
}

/** A value past the depth or node cap, described by its type alone. */
export interface AgentTruncatedSummary {
  readonly kind: "truncated";
  readonly type: string;
}

/** A reference back to a value already on the current path, marked rather than followed. */
export interface AgentCycleSummary {
  readonly kind: "cycle";
}

/** A value that could not be read, such as a throwing getter or a revoked proxy. */
export interface AgentUnreadableSummary {
  readonly kind: "unreadable";
}

/** The structural description of one value, carrying types and sizes but no values. */
export type AgentValueSummary =
  | AgentScalarSummary
  | AgentArraySummary
  | AgentObjectSummary
  | AgentKeyedCollectionSummary
  | AgentInstanceSummary
  | AgentTruncatedSummary
  | AgentCycleSummary
  | AgentUnreadableSummary;

const CYCLE: AgentCycleSummary = Object.freeze({ kind: "cycle" });
const UNREADABLE: AgentUnreadableSummary = Object.freeze({ kind: "unreadable" });

interface SummarizeContext {
  /** Values on the current path, used to mark cycles without following them. */
  readonly path: Set<object>;
  /** Remaining node budget, shared across the whole traversal. */
  remaining: number;
}

/**
 * Describes a payload for the event stream without emitting the values it contains.
 *
 * Structural mode reports key names, value types, and collection sizes under a depth,
 * key, and node cap; verbatim mode returns the payload unchanged for hosts that opted
 * in. The structural path is total: it never throws, for any input.
 *
 * @param value - Arbitrary host data, which may be cyclic, exotic, or hostile.
 * @param mode - Whether to describe the payload or forward it as-is.
 */
export function summarizePayload(value: unknown, mode: "structural"): AgentValueSummary;
export function summarizePayload(value: unknown, mode: AgentPayloadMode): unknown;
export function summarizePayload(value: unknown, mode: AgentPayloadMode): unknown {
  if (mode === "verbatim") {
    return value;
  }

  try {
    return summarizeValue(value, 0, { path: new Set<object>(), remaining: MAX_NODES });
  } catch {
    return UNREADABLE;
  }
}

function summarizeValue(
  value: unknown,
  depth: number,
  context: SummarizeContext,
): AgentValueSummary {
  const scalar = scalarSummary(value);
  if (scalar) {
    return scalar;
  }

  const target = value as object;
  if (context.path.has(target)) {
    return CYCLE;
  }

  if (depth >= MAX_DEPTH || context.remaining <= 0) {
    return truncatedSummary(target);
  }

  context.remaining -= 1;
  context.path.add(target);
  try {
    return summarizeObject(target, depth, context);
  } catch {
    return UNREADABLE;
  } finally {
    context.path.delete(target);
  }
}

function summarizeObject(
  value: object,
  depth: number,
  context: SummarizeContext,
): AgentValueSummary {
  if (Array.isArray(value)) {
    return summarizeArray(value as readonly unknown[], depth, context);
  }

  const className = classNameOf(value);
  if (className !== undefined) {
    return instanceSummary(value, className);
  }

  const keys = Object.keys(value);
  if (keys.length > MAX_KEY_COUNT || keys.some((key) => key.length > MAX_KEY_LENGTH)) {
    return keyedCollectionSummary(value, keys);
  }

  const entries = Object.create(null) as Record<string, AgentValueSummary>;
  for (const key of keys) {
    entries[key] = summarizeProperty(value, key, depth + 1, context);
  }

  const summary: AgentObjectSummary = {
    kind: "object",
    size: keys.length,
    entries: Object.freeze(entries),
  };
  return Object.freeze(summary);
}

function summarizeArray(
  value: readonly unknown[],
  depth: number,
  context: SummarizeContext,
): AgentArraySummary {
  const size = value.length;
  const sample: AgentValueSummary[] = [];
  for (let index = 0; index < size && index < MAX_ARRAY_SAMPLE; index += 1) {
    sample.push(summarizeProperty(value, index, depth + 1, context));
  }

  const summary: AgentArraySummary = { kind: "array", size, sample: Object.freeze(sample) };
  return Object.freeze(summary);
}

function keyedCollectionSummary(
  value: object,
  keys: readonly string[],
): AgentKeyedCollectionSummary {
  const summary: AgentKeyedCollectionSummary = {
    kind: "keyed",
    size: keys.length,
    keyType: keyTypeOf(keys),
    valueType: sampledValueType(value, keys),
  };
  return Object.freeze(summary);
}

function instanceSummary(value: object, className: string): AgentInstanceSummary {
  const size = collectionSizeOf(value);
  const summary: AgentInstanceSummary =
    size === undefined ? { kind: "instance", className } : { kind: "instance", className, size };
  return Object.freeze(summary);
}

function truncatedSummary(value: object): AgentTruncatedSummary {
  const summary: AgentTruncatedSummary = { kind: "truncated", type: typeLabel(value) };
  return Object.freeze(summary);
}

function summarizeProperty(
  target: object,
  key: string | number,
  depth: number,
  context: SummarizeContext,
): AgentValueSummary {
  let raw: unknown;
  try {
    raw = (target as Record<string | number, unknown>)[key];
  } catch {
    return UNREADABLE;
  }
  return summarizeValue(raw, depth, context);
}

function scalarSummary(value: unknown): AgentScalarSummary | undefined {
  const type = scalarTypeOf(value);
  return type === undefined ? undefined : Object.freeze({ kind: "scalar", type });
}

function scalarTypeOf(value: unknown): AgentScalarType | undefined {
  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(value) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "function":
      return "function";
    default:
      return undefined;
  }
}

/** Reports a value's type without reporting the value, for capped and aggregated cases. */
function typeLabel(value: unknown): string {
  const scalar = scalarTypeOf(value);
  if (scalar !== undefined) {
    return scalar;
  }

  if (Array.isArray(value)) {
    return "Array";
  }

  try {
    return classNameOf(value as object) ?? "object";
  } catch {
    return "unreadable";
  }
}

/**
 * Returns the constructor name of a non-plain value, or `undefined` when it is plain.
 *
 * Null-prototype objects and objects constructed by any realm's `Object` are treated as
 * plain so cross-realm payloads are still described structurally.
 */
function classNameOf(value: object): string | undefined {
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype === null || prototype === Object.prototype) {
    return undefined;
  }

  const name = (prototype as { readonly constructor?: { readonly name?: unknown } }).constructor
    ?.name;
  if (typeof name !== "string" || name.length === 0) {
    return "(anonymous)";
  }
  return name === "Object" ? undefined : name;
}

function collectionSizeOf(value: object): number | undefined {
  if (!(value instanceof Map) && !(value instanceof Set)) {
    return undefined;
  }

  try {
    const size: unknown = value.size;
    return typeof size === "number" ? size : undefined;
  } catch {
    return undefined;
  }
}

function keyTypeOf(keys: readonly string[]): AgentKeyedCollectionSummary["keyType"] {
  let sawIndex = false;
  let sawName = false;
  for (const key of keys) {
    if (String(Number.parseInt(key, 10)) === key) {
      sawIndex = true;
    } else {
      sawName = true;
    }
    if (sawIndex && sawName) {
      return "mixed";
    }
  }
  return sawIndex ? "number" : "string";
}

function sampledValueType(value: object, keys: readonly string[]): string {
  let observed: string | undefined;
  for (let index = 0; index < keys.length && index < MAX_VALUE_SAMPLE; index += 1) {
    const key = keys[index] as string;
    let label: string;
    try {
      label = typeLabel((value as Record<string, unknown>)[key]);
    } catch {
      label = "unreadable";
    }

    if (observed === undefined) {
      observed = label;
    } else if (observed !== label) {
      return "mixed";
    }
  }
  return observed ?? "undefined";
}
