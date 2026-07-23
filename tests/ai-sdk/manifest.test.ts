import { describe, expect, test } from "bun:test";

import { AgentComponentController } from "../../src/core/index.js";
import { createAIToolRouting, toActiveAgentManifest } from "../../src/ai-sdk/index.js";
import { testRegistration } from "../helpers/component.js";

describe("AI SDK manifest routing", () => {
  test("serializes only active addresses for the server boundary", () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("product results"));

    const activeManifest = toActiveAgentManifest(controller.getManifest());
    const serialized = JSON.stringify(activeManifest);

    expect(activeManifest).toEqual({
      version: 1,
      components: [{ id: "product results", tools: [{ key: "load-items" }] }],
    });
    expect(serialized).not.toContain("description");
    expect(serialized).not.toContain("instructions");
    expect(serialized).not.toContain("inputSchema");
    expect(serialized).not.toContain("approval");
  });

  test("creates deterministic AI SDK-safe names and reversible routes", () => {
    const activeManifest = {
      version: 3,
      components: [{ id: "product results/primary", tools: [{ key: "load items" }] }],
    } as const;

    const first = createAIToolRouting(activeManifest);
    const second = createAIToolRouting(activeManifest);
    const [name] = first.keys();

    expect(name).toMatch(/^[A-Za-z0-9_]+$/);
    expect(Array.from(second.keys())).toEqual(Array.from(first.keys()));
    expect(first.get(name!)).toEqual({
      componentId: "product results/primary",
      toolKey: "load items",
    });
  });
});
