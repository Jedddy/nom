import { describe, expect, mock, test } from "bun:test";

import {
  AgentComponentController,
  defineAgentTool,
  type AgentComponentSnapshot,
  type AgentPipelineEvent,
} from "../../src/core/index.js";
import { testRegistration } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";

function collectEvents(controller: AgentComponentController): AgentPipelineEvent[] {
  const events: AgentPipelineEvent[] = [];
  controller.subscribeEvents((event) => {
    events.push(event);
  });
  return events;
}

function typesOf(events: readonly AgentPipelineEvent[]): string[] {
  return events.map(({ type }) => type);
}

describe("controller pipeline events", () => {
  test("names the superseded request and terminates it as aborted", async () => {
    const first = deferred<string[]>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "first" ? first.promise : ["Second"]),
      }),
    );
    const events = collectEvents(controller);

    const older = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "first" },
      requestId: "older",
    });
    const newer = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "second" },
      requestId: "newer",
    });

    await newer;
    first.resolve(["First"]);
    await expect(older).rejects.toMatchObject({ code: "aborted" });

    expect(
      events.find((event) => event.type === "request-started" && event.requestId === "newer"),
    ).toMatchObject({ supersededRequestId: "older" });
    expect(
      events.filter((event) => event.requestId === "older" && event.type === "request-failed"),
    ).toEqual([expect.objectContaining({ code: "aborted" })]);
  });

  test("flags whether the loading state carries previous props", async () => {
    const replacement = deferred<string[]>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "initial" ? ["Initial"] : replacement.promise),
      }),
    );
    const events = collectEvents(controller);

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "initial" },
      requestId: "initial",
    });
    const execution = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "replacement" },
      requestId: "replacement",
    });

    expect(events.filter((event) => event.type === "request-started")).toMatchObject([
      { requestId: "initial", hasPreviousProps: false },
      { requestId: "replacement", hasPreviousProps: true },
    ]);

    replacement.resolve(["Replacement"]);
    await execution;
  });

  test("reports every stage of a successful request in pipeline order", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
      requestId: "request-1",
    });

    expect(typesOf(events)).toEqual([
      "request-started",
      "input-validated",
      "authorized",
      "executed",
      "output-validated",
      "mapped",
      "request-succeeded",
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        componentId: "results",
        toolKey: "load-items",
        requestId: "request-1",
      });
      expect(typeof event.timestamp).toBe("number");
    }
  });

  test("reports an empty mapping as its own terminal outcome", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results", { execute: async () => [] }));
    const events = collectEvents(controller);

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "missing" },
    });

    expect(typesOf(events).at(-1)).toBe("request-empty");
  });

  test("stops at input validation when the input is rejected", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    await expect(
      controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: 42 },
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });

    expect(typesOf(events)).toEqual(["request-started", "request-failed"]);
    expect(events.at(-1)).toMatchObject({ type: "request-failed", code: "invalid-input" });
  });

  test("stops at authorization when the host policy denies the request", async () => {
    const controller = new AgentComponentController({ authorize: async () => false });
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    await expect(
      controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: "keyboard" },
      }),
    ).rejects.toMatchObject({ code: "authorization-denied" });

    expect(typesOf(events)).toEqual(["request-started", "input-validated", "request-failed"]);
    expect(events.at(-1)).toMatchObject({ code: "authorization-denied" });
  });

  test("reports validation and mapping without execution for external output", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    controller.beginRequest({
      componentId: "results",
      toolKey: "load-items",
      requestId: "remote-1",
    });
    await controller.applyOutput({
      componentId: "results",
      toolKey: "load-items",
      output: ["Remote item"],
      requestId: "remote-1",
    });

    expect(typesOf(events)).toEqual([
      "request-started",
      "output-validated",
      "mapped",
      "request-succeeded",
    ]);
  });

  test("reports the external failure code published by an adapter", () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    controller.failRequest({
      componentId: "results",
      toolKey: "load-items",
      requestId: "remote-1",
      code: "adapter-failed",
    });

    expect(events.at(-1)).toMatchObject({
      type: "request-failed",
      code: "adapter-failed",
      requestId: "remote-1",
    });
  });

  test("carries the rejected issue path without any schema issue message", async () => {
    const controller = new AgentComponentController();
    controller.register({
      id: "paths",
      instructions: "Render items.",
      tools: [
        defineAgentTool({
          key: "load",
          description: "Load items.",
          inputSchema: inputSchema(() => ({
            issues: [{ message: "query must not be 'restricted term'", path: ["query", 0] }],
          })),
          outputSchema: outputSchema((value) => ({ value })),
          execute: async () => [],
          mapOutput: () => ({ status: "empty" }),
        }),
      ],
    });
    const events = collectEvents(controller);

    await expect(
      controller.execute({ componentId: "paths", toolKey: "load", input: {} }),
    ).rejects.toMatchObject({ code: "invalid-input" });

    expect(events.at(-1)).toMatchObject({
      type: "request-failed",
      code: "invalid-input",
      issuePaths: [["query", 0]],
    });
    expect(JSON.stringify(events)).not.toContain("restricted term");
  });

  test("omits the failing error message from the terminal failure event", async () => {
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: async () => {
          throw new Error("database credentials must stay private");
        },
      }),
    );
    const events = collectEvents(controller);

    await expect(
      controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: "keyboard" },
      }),
    ).rejects.toMatchObject({ code: "execution-failed" });

    expect(events.at(-1)).toMatchObject({ type: "request-failed", code: "execution-failed" });
    expect(JSON.stringify(events)).not.toContain("database credentials");
  });

  test("carries no raw values on any event a subscriber receives", async () => {
    // Retention is a devtools capability, so this reads the events off the live
    // subscription rather than the history: an unconfigured controller still
    // delivers to subscribers, and what it delivers must stay value-free.
    const controller = new AgentComponentController();
    const events = collectEvents(controller);
    controller.register(
      testRegistration("results", { execute: async () => ["Wireless keyboard"] }),
    );

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "wireless keyboard" },
    });

    expect(events.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("wireless keyboard");
    expect(serialized).not.toContain("Wireless keyboard");
  });

  test("keeps a throwing listener from changing the outcome of a request", async () => {
    const run = async (subscribe: boolean) => {
      const onError = mock(() => undefined);
      const controller = new AgentComponentController({ onError });
      controller.register(testRegistration("results"));
      if (subscribe) {
        controller.subscribeEvents(() => {
          throw new Error("listener exploded");
        });
      }

      const resolved = await controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: "keyboard" },
        requestId: "request-1",
      });
      await expect(
        controller.execute({
          componentId: "results",
          toolKey: "load-items",
          input: { query: 42 },
          requestId: "request-2",
        }),
      ).rejects.toMatchObject({ code: "invalid-input" });

      return {
        resolved,
        snapshot: controller.getSnapshot("results") as AgentComponentSnapshot,
        errorCalls: onError.mock.calls.length,
      };
    };

    expect(await run(true)).toEqual(await run(false));
  });

  test("emits the aborted terminal once for an executor that settles late", async () => {
    const stuck = deferred<string[]>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "stuck" ? stuck.promise : ["Second"]),
      }),
    );
    const events = collectEvents(controller);

    const older = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "stuck" },
      requestId: "older",
    });
    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "second" },
      requestId: "newer",
    });

    const abortedFor = () =>
      events.filter((event) => event.requestId === "older" && event.type === "request-failed");
    expect(abortedFor()).toMatchObject([{ code: "aborted" }]);

    stuck.resolve(["Late item"]);
    await expect(older).rejects.toMatchObject({ code: "aborted" });
    expect(abortedFor()).toHaveLength(1);
  });

  test("emits a failure event for every onError call and for silent aborts", async () => {
    const onError = mock(() => undefined);
    const stuck = deferred<string[]>();
    const controller = new AgentComponentController({ onError });
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "stuck" ? stuck.promise : ["Second"]),
      }),
    );
    controller.register(
      testRegistration("failing", {
        execute: async () => {
          throw new Error("no data source");
        },
      }),
    );
    const events = collectEvents(controller);

    await expect(
      controller.execute({
        componentId: "failing",
        toolKey: "load-items",
        input: { query: "keyboard" },
        requestId: "failed-1",
      }),
    ).rejects.toMatchObject({ code: "execution-failed" });
    const older = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "stuck" },
      requestId: "older",
    });
    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "second" },
      requestId: "newer",
    });
    stuck.resolve(["Late item"]);
    await expect(older).rejects.toMatchObject({ code: "aborted" });

    const failures = events.filter((event) => event.type === "request-failed");
    expect(failures).toMatchObject([
      { requestId: "failed-1", code: "execution-failed" },
      { requestId: "older", code: "aborted" },
    ]);
    expect(onError.mock.calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "failed-1", componentId: "failing" }),
    );
  });

  test("returns a frozen history whose identity changes only on a new event", async () => {
    // Retention is a devtools capability, so the accessor's stability contract is
    // observable only on a controller the host configured for it.
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(testRegistration("results"));

    const empty = controller.getEvents();
    expect(empty).toEqual([]);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(controller.getEvents()).toBe(empty);

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
    });

    const recorded = controller.getEvents();
    expect(recorded).not.toBe(empty);
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(controller.getEvents()).toBe(recorded);
  });

  test("leaves snapshots, manifests, and onError unchanged without a subscriber", async () => {
    const onError = mock(() => undefined);
    const controller = new AgentComponentController({ onError });
    controller.register(testRegistration("results"));

    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
      requestId: "request-1",
    });
    expect(controller.getSnapshot("results")).toEqual({
      status: "success",
      requestId: "request-1",
      props: { items: ["keyboard"] },
    });
    expect(controller.getManifest()).toMatchObject({
      version: 1,
      components: [{ id: "results", tools: [{ key: "load-items", approval: "never" }] }],
    });

    await expect(
      controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: 42 },
        requestId: "request-2",
      }),
    ).rejects.toMatchObject({ code: "invalid-input" });
    expect(controller.getSnapshot("results")).toEqual({
      status: "failure",
      requestId: "request-2",
      error: { code: "invalid-input", message: "The request input is invalid." },
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
