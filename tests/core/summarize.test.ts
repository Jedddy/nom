import { describe, expect, test } from "bun:test";

import {
  summarizePayload,
  type AgentObjectSummary,
  type AgentValueSummary,
} from "../../src/core/summarize.js";

function expectObject(summary: AgentValueSummary): AgentObjectSummary {
  if (summary.kind !== "object") {
    throw new Error(`Expected an object summary, received "${summary.kind}".`);
  }
  return summary;
}

function entryOf(summary: AgentValueSummary, key: string): AgentValueSummary {
  const entry = expectObject(summary).entries[key];
  if (!entry) {
    throw new Error(`Expected an entry named "${key}".`);
  }
  return entry;
}

describe("summarizePayload", () => {
  test("reports field names, value types, and collection sizes without values", () => {
    const summary = summarizePayload({ title: "Wireless Keyboard", products: [] }, "structural");

    expect(entryOf(summary, "title")).toEqual({ kind: "scalar", type: "string" });
    expect(entryOf(summary, "products")).toEqual({ kind: "array", size: 0, sample: [] });
    expect(JSON.stringify(summary)).not.toContain("Wireless Keyboard");
  });

  test("describes values past the depth cap by type alone", () => {
    const summary = summarizePayload(
      { l1: { l2: { l3: { l4: { l5: "classified" } } } } },
      "structural",
    );

    const overCap = entryOf(entryOf(entryOf(entryOf(summary, "l1"), "l2"), "l3"), "l4");

    expect(overCap).toEqual({ kind: "truncated", type: "object" });
    expect(JSON.stringify(summary)).not.toContain("classified");
  });

  test("reports array size without describing every element", () => {
    const summary = summarizePayload(
      Array.from({ length: 500 }, (_, index) => `order-${index}`),
      "structural",
    );

    if (summary.kind !== "array") {
      throw new Error(`Expected an array summary, received "${summary.kind}".`);
    }
    expect(summary.size).toBe(500);
    expect(summary.sample.length).toBeLessThan(10);
    expect(summary.sample.every((element) => element.kind === "scalar")).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("order-0");
  });

  test("withholds key names for objects keyed by identifiers", () => {
    const identifiers = Array.from(
      { length: 40 },
      (_, index) => `8f14e45f-ceea-467a-9e2f-${String(index).padStart(12, "0")}`,
    );
    const byIdentifier: Record<string, { readonly visits: number }> = {};
    for (const identifier of identifiers) {
      byIdentifier[identifier] = { visits: 3 };
    }

    const summary = summarizePayload(byIdentifier, "structural");
    const serialized = JSON.stringify(summary);

    expect(summary).toEqual({ kind: "keyed", size: 40, keyType: "string", valueType: "object" });
    for (const identifier of identifiers) {
      expect(serialized).not.toContain(identifier);
    }
  });

  test("withholds key names when a single key exceeds the length bound", () => {
    const summary = summarizePayload(
      { "8f14e45fceea467a9e2f5b8e9c1d4a7b3e6f2c8d": 1 },
      "structural",
    );

    expect(summary).toEqual({ kind: "keyed", size: 1, keyType: "string", valueType: "number" });
    expect(JSON.stringify(summary)).not.toContain("8f14e45f");
  });

  test("describes non-plain values by constructor name", () => {
    class ShoppingCart {
      constructor(readonly total: number) {}
    }

    const summary = summarizePayload(
      {
        created: new Date("2026-08-05T00:00:00.000Z"),
        index: new Map([["sku-1", 1]]),
        cart: new ShoppingCart(4299),
      },
      "structural",
    );
    const serialized = JSON.stringify(summary);

    expect(entryOf(summary, "created")).toEqual({ kind: "instance", className: "Date" });
    expect(entryOf(summary, "index")).toEqual({ kind: "instance", className: "Map", size: 1 });
    expect(entryOf(summary, "cart")).toEqual({ kind: "instance", className: "ShoppingCart" });
    expect(serialized).not.toContain("2026-08-05");
    expect(serialized).not.toContain("sku-1");
    expect(serialized).not.toContain("4299");
  });

  test("marks cycles instead of following them", () => {
    const node: { readonly label: string; self?: unknown; readonly children: unknown[] } = {
      label: "root",
      children: [],
    };
    node.self = node;
    node.children.push(node);

    const summary = summarizePayload(node, "structural");

    expect(entryOf(summary, "self")).toEqual({ kind: "cycle" });
    const children = entryOf(summary, "children");
    if (children.kind !== "array") {
      throw new Error(`Expected an array summary, received "${children.kind}".`);
    }
    expect(children.sample[0]).toEqual({ kind: "cycle" });
  });

  test("gives null, undefined, NaN, and functions distinct descriptions", () => {
    const summary = summarizePayload(
      { missing: null, absent: undefined, amount: Number.NaN, onSelect: () => "chosen" },
      "structural",
    );

    const types = ["missing", "absent", "amount", "onSelect"].map((key) => {
      const entry = entryOf(summary, key);
      if (entry.kind !== "scalar") {
        throw new Error(`Expected a scalar summary for "${key}", received "${entry.kind}".`);
      }
      return entry.type;
    });

    expect(types).toEqual(["null", "undefined", "nan", "function"]);
    expect(new Set(types).size).toBe(4);
  });

  test("stays total for hostile and exotic values", () => {
    const throwing = {
      get boom(): never {
        throw new Error("getter failed");
      },
    };
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      token: "secret-token",
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    const summary = summarizePayload(
      {
        throwing,
        nullPrototype,
        revoked: revoked.proxy,
        big: 9007199254740993n,
        marker: Symbol("secret-marker"),
        frozen: Object.freeze({ frozenField: 1 }),
      },
      "structural",
    );
    const serialized = JSON.stringify(summary);

    expect(entryOf(entryOf(summary, "throwing"), "boom")).toEqual({ kind: "unreadable" });
    expect(entryOf(entryOf(summary, "nullPrototype"), "token")).toEqual({
      kind: "scalar",
      type: "string",
    });
    expect(entryOf(summary, "revoked")).toEqual({ kind: "unreadable" });
    expect(entryOf(summary, "big")).toEqual({ kind: "scalar", type: "bigint" });
    expect(entryOf(summary, "marker")).toEqual({ kind: "scalar", type: "symbol" });
    expect(entryOf(entryOf(summary, "frozen"), "frozenField")).toEqual({
      kind: "scalar",
      type: "number",
    });
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-marker");
    expect(serialized).not.toContain("9007199254740993");
  });

  test("describes top-level scalars without throwing", () => {
    expect(summarizePayload(null, "structural")).toEqual({ kind: "scalar", type: "null" });
    expect(summarizePayload(undefined, "structural")).toEqual({
      kind: "scalar",
      type: "undefined",
    });
    expect(summarizePayload("query text", "structural")).toEqual({
      kind: "scalar",
      type: "string",
    });
  });

  test("returns the input unchanged in verbatim mode", () => {
    const value = { query: "keyboards", results: [{ id: 1 }] };

    expect(summarizePayload(value, "verbatim")).toBe(value);
    expect(summarizePayload(undefined, "verbatim")).toBeUndefined();
  });
});
