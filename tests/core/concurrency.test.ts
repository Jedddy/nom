import { describe, expect, mock, test } from "bun:test";

import { AgentComponentController } from "../../src/core/index.js";
import { testRegistration } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";

describe("controller concurrency", () => {
  test("keeps the latest request when an older request finishes last", async () => {
    const first = deferred<string[]>();
    const mapper = mock((items: readonly string[]) => ({
      status: "success" as const,
      props: { items },
    }));
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "first" ? first.promise : ["Second"]),
        mapOutput: mapper,
      }),
    );

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
    expect(controller.getSnapshot("results")).toEqual({
      status: "success",
      requestId: "newer",
      props: { items: ["Second"] },
    });
    expect(mapper).toHaveBeenCalledTimes(1);
  });

  test("unregistration aborts work and suppresses late mapping and state writes", async () => {
    const pending = deferred<string[]>();
    const mapper = mock((items: readonly string[]) => ({
      status: "success" as const,
      props: { items },
    }));
    const controller = new AgentComponentController();
    const registration = controller.register(
      testRegistration("results", {
        execute: () => pending.promise,
        mapOutput: mapper,
      }),
    );
    const listener = mock(() => undefined);
    controller.subscribe("results", listener);

    const execution = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "keyboard" },
    });
    expect(registration.unregister()).toBe(true);
    expect(controller.getSnapshot("results")).toEqual({ status: "idle" });

    pending.resolve(["Late item"]);
    await expect(execution).rejects.toMatchObject({ code: "aborted" });
    expect(mapper).not.toHaveBeenCalled();
    expect(controller.getSnapshot("results")).toEqual({ status: "idle" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("preserves prior successful props while a replacement is loading", async () => {
    const replacement = deferred<string[]>();
    const controller = new AgentComponentController();
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "initial" ? ["Initial"] : replacement.promise),
      }),
    );
    await controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "initial" },
    });

    const execution = controller.execute({
      componentId: "results",
      toolKey: "load-items",
      input: { query: "replacement" },
      requestId: "replacement",
    });

    expect(controller.getSnapshot("results")).toEqual({
      status: "loading",
      requestId: "replacement",
      previousProps: { items: ["Initial"] },
    });
    replacement.resolve(["Replacement"]);
    await execution;
  });
});
