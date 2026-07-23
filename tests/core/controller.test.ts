import { describe, expect, mock, test } from "bun:test";

import {
  AgentComponentController,
  AgentComponentError,
  defineAgentTool,
} from "../../src/core/index.js";
import { testRegistration } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";

describe("AgentComponentController", () => {
  test("publishes loading synchronously before mapped props", async () => {
    const pending = deferred<string[]>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: () => pending.promise,
      }),
    );
    controller.register(testRegistration("unrelated"));
    const resultsListener = mock(() => undefined);
    const unrelatedListener = mock(() => undefined);
    controller.subscribe("results", resultsListener);
    controller.subscribe("unrelated", unrelatedListener);

    const execution = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
      requestId: "request-1",
    });

    expect(controller.getSnapshot("results")).toEqual({
      status: "loading",
      requestId: "request-1",
    });
    expect(unrelatedListener).not.toHaveBeenCalled();

    pending.resolve(["Keyboard"]);
    await expect(execution).resolves.toEqual(["Keyboard"]);
    expect(controller.getSnapshot("results")).toEqual({
      status: "success",
      requestId: "request-1",
      props: { items: ["Keyboard"] },
    });
    expect(resultsListener).toHaveBeenCalledTimes(2);
  });

  test("represents an explicit empty mapping separately", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results", { execute: async () => [] }));

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "missing" },
    });

    expect(controller.getSnapshot("results").status).toBe("empty");
  });

  test("does not map output that fails runtime validation", async () => {
    const mapper = mock(() => ({ status: "empty" as const }));
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: async () => ({ unsafe: true }) as unknown as string[],
        mapOutput: mapper,
      }),
    );

    const execution = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
    });

    await expect(execution).rejects.toMatchObject({ code: "invalid-output" });
    expect(mapper).not.toHaveBeenCalled();
    expect(controller.getSnapshot("results")).toMatchObject({
      status: "failure",
      error: { code: "invalid-output" },
    });
  });

  test("classifies input, execution, and mapping failures", async () => {
    const invalidInputController = new AgentComponentController();
    invalidInputController.register(testRegistration("invalid-input"));
    await expect(
      invalidInputController.execute({
        componentId: "invalid-input",
        toolKey: "load-items",
        input: { query: 42 },
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });

    const executionController = new AgentComponentController();
    executionController.register(
      testRegistration("execution", {
        execute: async () => {
          throw new Error("database credentials must stay private");
        },
      }),
    );
    await expect(
      executionController.execute({
        componentId: "execution",
        toolKey: "load-items",
        input: { query: "keyboard" },
      }),
    ).rejects.toMatchObject({ code: "execution-failed" });
    expect(executionController.getSnapshot("execution")).toMatchObject({
      status: "failure",
      error: {
        code: "execution-failed",
        message: "The tool could not complete the request.",
      },
    });

    const mappingController = new AgentComponentController();
    mappingController.register(
      testRegistration("mapping", {
        mapOutput: async () => {
          throw new Error("private mapping detail");
        },
      }),
    );
    await expect(
      mappingController.execute({
        componentId: "mapping",
        toolKey: "load-items",
        input: { query: "keyboard" },
      }),
    ).rejects.toMatchObject({ code: "mapping-failed" });
  });

  test("validates and maps output supplied by an external executor", async () => {
    const controller = new AgentComponentController();
    controller.register({
      id: "remote-results",
      instructions: "Render remote results.",
      tools: [
        defineAgentTool({
          key: "remote-load",
          description: "Load elsewhere.",
          inputSchema: inputSchema((value) => ({ value })),
          outputSchema: outputSchema((value) =>
            Array.isArray(value)
              ? { value: value as string[] }
              : { issues: [{ message: "Expected items" }] },
          ),
          mapOutput: (items) => ({ status: "success", props: { items } }),
        }),
      ],
    });
    const listener = mock(() => undefined);
    controller.subscribe("remote-results", listener);

    controller.beginRequest({
      componentId: "remote-results",
      toolKey: "remote-load",
      requestId: "remote-1",
    });
    const application = controller.applyOutput({
      componentId: "remote-results",
      toolKey: "remote-load",
      output: ["Remote item"],
      requestId: "remote-1",
    });

    expect(controller.getSnapshot("remote-results").status).toBe("loading");
    await application;
    expect(controller.getSnapshot("remote-results")).toMatchObject({
      status: "success",
      props: { items: ["Remote item"] },
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("returns the output produced by Standard Schema validation", async () => {
    const controller = new AgentComponentController();
    controller.register({
      id: "normalized-results",
      instructions: "Normalize results.",
      tools: [
        defineAgentTool({
          key: "normalize",
          description: "Normalize loaded items.",
          inputSchema: inputSchema((value) => ({ value })),
          outputSchema: outputSchema((value) =>
            Array.isArray(value)
              ? { value: value.map((item) => String(item).toUpperCase()) }
              : { issues: [{ message: "Expected items" }] },
          ),
          execute: async () => ["normalized"],
          mapOutput: (items) => ({ status: "success", props: { items } }),
        }),
      ],
    });

    await expect(
      controller.execute({
        componentId: "normalized-results",
        toolKey: "normalize",
        input: {},
      }),
    ).resolves.toEqual(["NORMALIZED"]);
  });

  test("rejects unavailable addresses with typed errors", async () => {
    const controller = new AgentComponentController();

    await expect(
      controller.execute({ componentId: "missing", toolKey: "load", input: {} }),
    ).rejects.toEqual(
      new AgentComponentError("registration-unavailable", 'Component "missing" is not registered.'),
    );
  });
});
