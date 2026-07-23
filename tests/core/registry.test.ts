import { describe, expect, mock, test } from "bun:test";

import {
  AgentComponentError,
  AgentComponentRegistry,
  defineAgentTool,
  type AgentComponentRegistration,
} from "../../src/core/index.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";

interface ProductListProps {
  readonly products: readonly string[];
}

function productRegistration(
  id: string,
  instructions = "Show products matching the user's query.",
): AgentComponentRegistration<ProductListProps> {
  return {
    id,
    instructions,
    tools: [
      defineAgentTool({
        key: "search-products",
        description: "Search the product catalog.",
        inputSchema: inputSchema(
          (value) =>
            typeof value === "object" && value !== null && "query" in value
              ? { value: value as { readonly query: string } }
              : { issues: [{ message: "Expected a query" }] },
          {
            type: "object",
            properties: { query: { type: "string" } },
          },
        ),
        outputSchema: outputSchema((value) =>
          Array.isArray(value)
            ? { value: value as string[] }
            : { issues: [{ message: "Expected products" }] },
        ),
        execute: async () => ["Keyboard"],
        mapOutput: (products) => ({ status: "success", props: { products } }),
      }),
    ],
  };
}

describe("AgentComponentRegistry", () => {
  test("keeps reusable component instances independent", () => {
    const registry = new AgentComponentRegistry();

    registry.register(productRegistration("featured-products"));
    registry.register(productRegistration("search-results"));

    expect(registry.getManifest().components.map(({ id }) => id)).toEqual([
      "featured-products",
      "search-results",
    ]);
  });

  test("rejects duplicate active instance ids", () => {
    const registry = new AgentComponentRegistry();
    registry.register(productRegistration("products"));

    expect(() => registry.register(productRegistration("products"))).toThrow(
      new AgentComponentError(
        "duplicate-registration",
        'Component "products" is already registered.',
      ),
    );
  });

  test("makes cleanup idempotent and ownership-safe", () => {
    const registry = new AgentComponentRegistry();
    const first = registry.register(productRegistration("products"));

    expect(first.unregister()).toBe(true);
    expect(first.unregister()).toBe(false);

    registry.register(productRegistration("products", "Replacement registration"));
    expect(first.unregister()).toBe(false);
    expect(registry.getManifest().components[0]?.instructions).toBe("Replacement registration");
  });

  test("captures ownership independently from caller mutation", () => {
    const registry = new AgentComponentRegistry();
    const registration = productRegistration("products");
    const handle = registry.register(registration);

    (registration as { id: string }).id = "mutated";

    expect(handle.unregister()).toBe(true);
    expect(registry.getManifest().components).toHaveLength(0);
  });

  test("updates metadata without replacing ownership", () => {
    const registry = new AgentComponentRegistry();
    const handle = registry.register(productRegistration("products"));

    handle.update(productRegistration("products", "Updated instructions"));

    expect(registry.getManifest().components[0]?.instructions).toBe("Updated instructions");
  });

  test("notifies registry subscribers only when the registry changes", () => {
    const registry = new AgentComponentRegistry();
    const listener = mock(() => undefined);
    const unsubscribe = registry.subscribe(listener);

    const handle = registry.register(productRegistration("products"));
    handle.update(productRegistration("products", "Updated instructions"));
    handle.unregister();
    unsubscribe();
    registry.register(productRegistration("other-products"));

    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("serializes only safe capability metadata", () => {
    const registry = new AgentComponentRegistry();
    registry.register(productRegistration("products"));

    const manifest = registry.getManifest();
    const serialized = JSON.stringify(manifest);

    expect(serialized).toContain("search-products");
    expect(serialized).not.toContain("mapOutput");
    expect(serialized).not.toContain("execute");
    expect(manifest).toBe(registry.getManifest());
    const schema = manifest.components[0]?.tools[0]?.inputSchema;
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema?.properties)).toBe(true);
  });
});
