import { describe, expect, test } from "bun:test";

import {
  AgentComponentController,
  defineAgentTool,
  type AgentComponentRegistration,
  type AgentPipelineEvent,
} from "../../src/core/index.js";
import { testRegistration } from "../helpers/component.js";
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

async function loadItems(
  controller: AgentComponentController,
  query: string,
  requestId?: string,
): Promise<unknown> {
  return controller.execute({
    componentId: "results",
    toolKey: "load-items",
    input: { query },
    ...(requestId === undefined ? {} : { requestId }),
  });
}

interface Probe {
  readonly registration: AgentComponentRegistration<{ readonly ok: boolean }>;
  readonly output: unknown;
  reads: () => number;
}

/**
 * Builds a component whose output can only be read by walking it.
 *
 * Neither schema nor the mapper touches the property, so a read of the counting getter is
 * proof that the summarizer walked the payload.
 */
function payloadProbe(): Probe {
  let reads = 0;
  const output = {
    get secret(): string {
      reads += 1;
      return "walked";
    },
  };

  return {
    output,
    reads: () => reads,
    registration: {
      id: "probe",
      instructions: "Render probe output.",
      tools: [
        defineAgentTool({
          key: "load",
          description: "Load probe output.",
          inputSchema: inputSchema((value) => ({ value })),
          outputSchema: outputSchema((value) => ({ value })),
          execute: async () => output,
          mapOutput: () => ({ status: "success", props: { ok: true } }),
        }),
      ],
    },
  };
}

async function runProbe(controller: AgentComponentController): Promise<void> {
  await controller.execute({ componentId: "probe", toolKey: "load", input: {} });
}

describe("devtools configuration", () => {
  test("describes payloads structurally by default and forwards them verbatim on request", async () => {
    const structural = new AgentComponentController({ devtools: {} });
    structural.register(testRegistration("results"));
    await loadItems(structural, "keyboard");

    const structuralEvents = structural.getEvents();
    expect(structuralEvents.find(({ type }) => type === "input-validated")).toMatchObject({
      input: { kind: "object", size: 1, entries: { query: { kind: "scalar", type: "string" } } },
    });
    expect(structuralEvents.find(({ type }) => type === "output-validated")).toMatchObject({
      output: { kind: "array", size: 1 },
    });
    expect(structuralEvents.find(({ type }) => type === "request-succeeded")).toMatchObject({
      props: { kind: "object", entries: { items: { kind: "array", size: 1 } } },
    });
    expect(JSON.stringify(structuralEvents)).not.toContain("keyboard");

    const verbatim = new AgentComponentController({ devtools: { verbatimPayloads: true } });
    verbatim.register(testRegistration("results"));
    await loadItems(verbatim, "keyboard");

    const verbatimEvents = verbatim.getEvents();
    expect(verbatimEvents.find(({ type }) => type === "input-validated")).toMatchObject({
      input: { query: "keyboard" },
    });
    expect(verbatimEvents.find(({ type }) => type === "output-validated")).toMatchObject({
      output: ["keyboard"],
    });
    expect(verbatimEvents.find(({ type }) => type === "request-succeeded")).toMatchObject({
      props: { items: ["keyboard"] },
    });
  });

  test("withholds verbatim values from a subscriber the host did not opt in for", async () => {
    const controller = new AgentComponentController();
    controller.register(testRegistration("results"));
    const events = collectEvents(controller);

    await loadItems(controller, "keyboard");

    expect(controller.getDevtoolsSettings().payloadMode).toBe("structural");
    expect(events.find(({ type }) => type === "input-validated")).toMatchObject({
      input: { kind: "object" },
    });
    expect(JSON.stringify(events)).not.toContain("keyboard");
  });

  test("reports mock-fire as disabled unless the host enables it", () => {
    expect(new AgentComponentController().getDevtoolsSettings()).toEqual({
      enabled: false,
      payloadMode: "structural",
      mockFire: false,
      historyLimit: 0,
    });
    expect(new AgentComponentController({ devtools: {} }).getDevtoolsSettings()).toEqual({
      enabled: true,
      payloadMode: "structural",
      mockFire: false,
      historyLimit: 200,
    });
    expect(
      new AgentComponentController({
        devtools: { verbatimPayloads: true },
      }).getDevtoolsSettings(),
    ).toMatchObject({ payloadMode: "verbatim", mockFire: false });
    expect(
      new AgentComponentController({ devtools: { mockFire: true } }).getDevtoolsSettings(),
    ).toMatchObject({ payloadMode: "structural", mockFire: true });
  });

  test("discards the oldest events once the history bound is reached", async () => {
    const controller = new AgentComponentController({ devtools: { historyLimit: 3 } });
    controller.register(testRegistration("results"));

    await loadItems(controller, "first", "request-1");
    await loadItems(controller, "second", "request-2");

    const retained = controller.getEvents();
    expect(retained).toHaveLength(3);
    expect(typesOf(retained)).toEqual(["output-validated", "mapped", "request-succeeded"]);
    expect(retained.every(({ requestId }) => requestId === "request-2")).toBe(true);
  });

  test("retains history from construction and replays it to a later subscriber", async () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(testRegistration("results"));

    await loadItems(controller, "first", "request-1");
    await loadItems(controller, "second", "request-2");

    const replayed = controller.getEvents();
    expect(replayed).toHaveLength(14);
    expect(replayed[0]).toMatchObject({ type: "request-started", requestId: "request-1" });

    const live = collectEvents(controller);
    await loadItems(controller, "third", "request-3");
    expect(controller.getEvents()).toHaveLength(21);
    expect(live).toHaveLength(7);
  });

  test("retains no history without devtools options, with or without a subscriber", async () => {
    const unsubscribed = new AgentComponentController();
    unsubscribed.register(testRegistration("results"));
    await loadItems(unsubscribed, "keyboard");
    expect(unsubscribed.getEvents()).toEqual([]);

    const subscribed = new AgentComponentController();
    subscribed.register(testRegistration("results"));
    const delivered = collectEvents(subscribed);
    const beforeActivity = subscribed.getEvents();
    await loadItems(subscribed, "keyboard");

    // Live delivery is unaffected; only retention and replay require the opt-in.
    expect(typesOf(delivered)).toEqual([
      "request-started",
      "input-validated",
      "authorized",
      "executed",
      "output-validated",
      "mapped",
      "request-succeeded",
    ]);
    expect(subscribed.getEvents()).toEqual([]);
    expect(subscribed.getEvents()).toBe(beforeActivity);
  });

  test("never walks a payload for a default controller with no subscriber", async () => {
    const unobserved = payloadProbe();
    const unobservedController = new AgentComponentController();
    unobservedController.register(unobserved.registration);
    await runProbe(unobservedController);

    expect(unobserved.reads()).toBe(0);

    const subscribed = payloadProbe();
    const subscribedController = new AgentComponentController();
    subscribedController.register(subscribed.registration);
    const delivered = collectEvents(subscribedController);
    await runProbe(subscribedController);

    expect(subscribed.reads()).toBeGreaterThan(0);
    expect(delivered.find(({ type }) => type === "output-validated")).toMatchObject({
      output: { kind: "object", entries: { secret: { kind: "scalar", type: "string" } } },
    });
    expect(JSON.stringify(delivered)).not.toContain("walked");

    const configured = payloadProbe();
    const configuredController = new AgentComponentController({ devtools: {} });
    configuredController.register(configured.registration);
    await runProbe(configuredController);

    expect(configured.reads()).toBeGreaterThan(0);
    expect(
      configuredController.getEvents().find(({ type }) => type === "output-validated"),
    ).toHaveProperty("output");
  });

  test("returns the same history identity until a new event is recorded", async () => {
    const controller = new AgentComponentController({ devtools: { historyLimit: 2 } });
    controller.register(testRegistration("results"));

    const empty = controller.getEvents();
    expect(empty).toEqual([]);
    expect(controller.getEvents()).toBe(empty);

    await loadItems(controller, "keyboard");

    const recorded = controller.getEvents();
    expect(recorded).not.toBe(empty);
    expect(Object.isFrozen(recorded)).toBe(true);
    expect(controller.getEvents()).toBe(recorded);

    await loadItems(controller, "mouse");
    expect(controller.getEvents()).not.toBe(recorded);
    expect(recorded).toHaveLength(2);
  });

  test("fixes the devtools settings at construction", async () => {
    const options = { verbatimPayloads: false, mockFire: false };
    const controller = new AgentComponentController({ devtools: options });
    controller.register(testRegistration("results"));

    const settings = controller.getDevtoolsSettings();
    expect(Object.isFrozen(settings)).toBe(true);
    expect(controller.getDevtoolsSettings()).toBe(settings);
    expect(() => {
      (settings as { payloadMode: string }).payloadMode = "verbatim";
    }).toThrow();

    options.verbatimPayloads = true;
    options.mockFire = true;
    await loadItems(controller, "keyboard");

    expect(controller.getDevtoolsSettings()).toMatchObject({
      payloadMode: "structural",
      mockFire: false,
    });
    expect(JSON.stringify(controller.getEvents())).not.toContain("keyboard");
  });
});
