import { describe, expect, mock, test } from "bun:test";
import { tool } from "ai";

import { AgentComponentController, defineAgentTool } from "../../src/core/index.js";
import {
  createAIToolName,
  createAISDKServerTools,
  createAISDKTools,
  toActiveAgentManifest,
} from "../../src/ai-sdk/index.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";
import { testRegistration } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";

const toolOptions = { toolCallId: "call-1", messages: [] };

describe("AI SDK tools", () => {
  test("executes a same-runtime tool through the core controller", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const adapter = createAISDKTools(controller);
    const [name] = adapter.routing.keys();
    const tool = adapter.tools[name!];

    expect(tool?.description).toContain("Show items matching");
    expect(tool?.needsApproval).toBe(false);
    await expect(tool?.execute?.({ query: "Keyboard" }, toolOptions)).resolves.toEqual([
      "Keyboard",
    ]);
    expect(controller.getSnapshot("products")).toMatchObject({
      status: "success",
      props: { items: ["Keyboard"] },
    });
  });

  test("adds host-owned default tools without routing them to components", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const getCurrentDate = currentDateTool();
    const adapter = createAISDKTools(controller, {
      defaultTools: { get_current_date: getCurrentDate },
    });

    expect(adapter.tools.get_current_date).toBe(getCurrentDate);
    expect(adapter.routing.has("get_current_date")).toBe(false);
    await expect(adapter.tools.get_current_date?.execute?.({}, toolOptions)).resolves.toBe(
      "2026-07-22",
    );
  });

  test("adds default tools to a split-runtime server adapter", () => {
    const activeManifest = {
      version: 1,
      components: [{ id: "products", tools: [{ key: "load-items" }] }],
    } as const;
    const getCurrentDate = currentDateTool();
    const adapter = createAISDKServerTools(activeManifest, {
      defaultTools: { get_current_date: getCurrentDate },
      resolve: () => ({
        description: "Load products.",
        inputSchema: inputSchema((value) => ({ value })),
        approval: "never",
      }),
    });

    expect(adapter.tools.get_current_date).toBe(getCurrentDate);
    expect(adapter.routing.has("get_current_date")).toBe(false);
  });

  test("rejects default tools without model-facing documentation", () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const undocumentedTool = tool({
      inputSchema: inputSchema(() => ({ value: {} })),
      execute: async () => "hidden",
    });

    expect(() =>
      createAISDKTools(controller, {
        defaultTools: { undocumented: undocumentedTool },
      }),
    ).toThrow(
      expect.objectContaining({
        code: "adapter-failed",
        message: expect.stringContaining('Default tool "undocumented"'),
      }),
    );
  });

  test("rejects blank default tool documentation in the server adapter", () => {
    const activeManifest = { version: 1, components: [] } as const;
    const blankDescriptionTool = tool({
      description: "   ",
      inputSchema: inputSchema(() => ({ value: {} })),
      execute: async () => "hidden",
    });

    expect(() =>
      createAISDKServerTools(activeManifest, {
        defaultTools: { blank_description: blankDescriptionTool },
        resolve: () => undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "adapter-failed",
        message: expect.stringContaining('Default tool "blank_description"'),
      }),
    );
  });

  test("rejects a default tool name that collides with a component tool", () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const componentToolName = createAIToolName("products", "load-items");

    expect(() =>
      createAISDKTools(controller, {
        defaultTools: { [componentToolName]: currentDateTool() },
      }),
    ).toThrow(expect.objectContaining({ code: "adapter-failed" }));
  });

  test("defaults model-visible results to a safe acknowledgement", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const adapter = createAISDKTools(controller);
    const [name] = adapter.routing.keys();
    const tool = adapter.tools[name!];

    await expect(
      tool?.toModelOutput?.({
        toolCallId: "call-1",
        input: { query: "private" },
        output: ["sensitive component data"],
      }),
    ).resolves.toEqual({ type: "text", value: "Component data loaded." });
  });

  test("propagates AI SDK cancellation to the registered executor", async () => {
    const started = deferred<AbortSignal>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("products", {
        execute: (_input, signal) => {
          started.resolve(signal);
          return new Promise<string[]>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      }),
    );
    const adapter = createAISDKTools(controller);
    const [name] = adapter.routing.keys();
    const abortController = new AbortController();

    const execution = adapter.tools[name!]?.execute?.(
      { query: "Keyboard" },
      { ...toolOptions, abortSignal: abortController.signal },
    );
    const executorSignal = await started.promise;
    abortController.abort();

    expect(executorSignal.aborted).toBe(true);
    await expect(execution).rejects.toMatchObject({ code: "aborted" });
    expect(controller.getSnapshot("products")).toMatchObject({
      status: "failure",
      error: { code: "aborted" },
    });
  });

  test("uses an explicit developer projection when provided", async () => {
    const controller = new AgentComponentController();
    controller.register({
      id: "counts",
      instructions: "Show a count.",
      tools: [
        defineAgentTool({
          key: "load-count",
          description: "Load a count.",
          inputSchema: inputSchema((value) => ({ value })),
          outputSchema: outputSchema((value) =>
            typeof value === "number" ? { value } : { issues: [{ message: "Expected a number" }] },
          ),
          execute: async () => 4,
          mapOutput: (count) => ({ status: "success", props: { count } }),
          projectModelOutput: (count) => ({
            type: "json",
            value: { loadedCount: count },
          }),
        }),
      ],
    });
    const adapter = createAISDKTools(controller);
    const [name] = adapter.routing.keys();

    await expect(
      adapter.tools[name!]?.toModelOutput?.({
        toolCallId: "call-count",
        input: {},
        output: 4,
      }),
    ).resolves.toEqual({ type: "json", value: { loadedCount: 4 } });
  });

  test("canonicalizes untrusted active addresses through a server-owned resolver", () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("products"));
    const activeManifest = toActiveAgentManifest(controller.getManifest());
    const execute = mock(async () => ["Server result"]);
    const server = createAISDKServerTools(activeManifest, {
      resolve: ({ componentId, toolKey }) =>
        componentId === "products" && toolKey === "load-items"
          ? {
              description: "Canonical server description.",
              inputSchema: inputSchema((value) => ({ value })),
              approval: "required",
              execute,
            }
          : undefined,
    });
    const [name] = server.routing.keys();

    expect(server.tools[name!]?.description).toBe("Canonical server description.");
    expect(server.tools[name!]?.needsApproval).toBe(true);
  });

  test("re-runs server-owned authorization before invoking an executor", async () => {
    const activeManifest = {
      version: 1,
      components: [{ id: "products", tools: [{ key: "load-items" }] }],
    } as const;
    const execute = mock(async () => ["Server result"]);
    const definition = {
      description: "Load products on the server.",
      inputSchema: inputSchema((value) => ({ value })),
      approval: "required" as const,
      execute,
    };
    const denied = createAISDKServerTools(activeManifest, {
      resolve: () => definition,
    });
    const [deniedName] = denied.routing.keys();

    await expect(
      denied.tools[deniedName!]?.execute?.({ query: "Keyboard" }, toolOptions),
    ).rejects.toMatchObject({ code: "authorization-denied" });
    expect(execute).not.toHaveBeenCalled();

    const allowed = createAISDKServerTools(activeManifest, {
      resolve: () => definition,
      authorize: async () => true,
    });
    const [allowedName] = allowed.routing.keys();
    await expect(
      allowed.tools[allowedName!]?.execute?.({ query: "Keyboard" }, toolOptions),
    ).resolves.toEqual(["Server result"]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("rejects addresses absent from the server-owned catalog", () => {
    const activeManifest = {
      version: 1,
      components: [{ id: "forged", tools: [{ key: "admin" }] }],
    } as const;

    expect(() => createAISDKServerTools(activeManifest, { resolve: () => undefined })).toThrow(
      expect.objectContaining({ code: "adapter-failed" }),
    );
  });

  test("rejects stale active manifest versions before catalog resolution", () => {
    const resolve = mock(() => undefined);
    const activeManifest = {
      version: 2,
      components: [{ id: "products", tools: [{ key: "load-items" }] }],
    } as const;

    expect(() =>
      createAISDKServerTools(activeManifest, {
        expectedManifestVersion: 3,
        resolve,
      }),
    ).toThrow(expect.objectContaining({ code: "adapter-failed" }));
    expect(resolve).not.toHaveBeenCalled();
  });

  test("supports forwarded tools without a server executor", () => {
    const activeManifest = {
      version: 1,
      components: [{ id: "products", tools: [{ key: "load-items" }] }],
    } as const;
    const server = createAISDKServerTools(activeManifest, {
      resolve: () => ({
        description: "Forward to the browser.",
        inputSchema: inputSchema((value) => ({ value })),
        approval: "never",
      }),
    });
    const [name] = server.routing.keys();

    expect(server.tools[name!]?.execute).toBeUndefined();
  });
});

function currentDateTool() {
  return tool({
    description: "Get the current calendar date.",
    inputSchema: inputSchema(() => ({ value: {} })),
    execute: async () => "2026-07-22",
  });
}
