import { describe, expect, mock, test } from "bun:test";

import { AgentComponentController } from "../../src/core/index.js";
import { testRegistration } from "../helpers/component.js";

describe("controller authorization", () => {
  test("denies approval-required tools when no host policy is configured", async () => {
    const execute = mock(async () => ["Keyboard"]);
    const controller = new AgentComponentController();
    controller.register(testRegistration("results", { approval: "required", execute }));

    await expect(
      controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: "keyboard" },
      }),
    ).rejects.toMatchObject({ code: "authorization-denied" });
    expect(execute).not.toHaveBeenCalled();
  });

  test("lets a host policy allow or deny any registered tool", async () => {
    const deniedExecute = mock(async () => ["Denied"]);
    const deniedController = new AgentComponentController({ authorize: async () => false });
    deniedController.register(testRegistration("denied", { execute: deniedExecute }));

    await expect(
      deniedController.execute({
        componentId: "denied",
        toolKey: "load-items",
        input: { query: "private" },
      }),
    ).rejects.toMatchObject({ code: "authorization-denied" });
    expect(deniedExecute).not.toHaveBeenCalled();

    const authorize = mock(async () => true);
    const allowedExecute = mock(async () => ["Allowed"]);
    const allowedController = new AgentComponentController({ authorize });
    allowedController.register(
      testRegistration("allowed", { approval: "required", execute: allowedExecute }),
    );

    await allowedController.execute({
      componentId: "allowed",
      toolKey: "load-items",
      input: { query: "keyboard" },
    });
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: "allowed",
        toolKey: "load-items",
        input: { query: "keyboard" },
        approval: "required",
      }),
    );
    expect(allowedExecute).toHaveBeenCalledTimes(1);
  });
});
