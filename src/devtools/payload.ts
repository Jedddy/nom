import type { AgentPayloadMode, AgentValueSummary } from "../core/summarize.js";

/**
 * Renders one event payload as text for the detail view.
 *
 * In structural mode the payload is an {@link AgentValueSummary} describing types and
 * sizes, so it is rendered as a shape. In verbatim mode the payload is the host value
 * itself, so it is serialized. Neither path throws: the panel must render whatever a host
 * put through the pipeline, including cyclic and exotic values.
 */
export function describePayload(value: unknown, mode: AgentPayloadMode): string {
  if (mode === "verbatim") {
    return stringifyVerbatim(value);
  }
  return isSummary(value) ? describeSummary(value) : stringifyVerbatim(value);
}

function isSummary(value: unknown): value is AgentValueSummary {
  return typeof value === "object" && value !== null && "kind" in value;
}

function stringifyVerbatim(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, replaceUnserializable, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function replaceUnserializable(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${value.toString()}n`;
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  return value;
}

/** Renders a structural summary as a compact shape, carrying types and sizes but no values. */
export function describeSummary(summary: AgentValueSummary): string {
  switch (summary.kind) {
    case "scalar":
      return summary.type;
    case "array": {
      const sample = summary.sample.map(describeSummary);
      if (summary.size > summary.sample.length) {
        sample.push("…");
      }
      return `array(${summary.size}) [${sample.join(", ")}]`;
    }
    case "object": {
      const entries = Object.entries(summary.entries).map(
        ([key, value]) => `${key}: ${describeSummary(value)}`,
      );
      return `object(${summary.size}) { ${entries.join(", ")} }`;
    }
    case "keyed":
      return `keyed collection(${summary.size}) { ${summary.keyType} keys, ${summary.valueType} values }`;
    case "instance":
      return summary.size === undefined
        ? summary.className
        : `${summary.className}(${summary.size})`;
    case "truncated":
      return `… ${summary.type}`;
    case "cycle":
      return "[cycle]";
    case "unreadable":
      return "[unreadable]";
    default:
      return "[unknown]";
  }
}

/** Renders one schema issue path, so a reader sees where a value was rejected, not what it was. */
export function describeIssuePath(path: readonly (string | number)[]): string {
  return path.length === 0 ? "(root)" : path.join(".");
}
