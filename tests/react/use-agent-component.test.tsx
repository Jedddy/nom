import { describe, expect, mock, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";

import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponentProvider, useAgentComponent } from "../../src/react/index.js";
import { testRegistration, type TestComponentProps } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";

function HookView({
  registration,
  onRender,
}: {
  readonly registration: ReturnType<typeof testRegistration>;
  readonly onRender?: () => void;
}) {
  onRender?.();
  const snapshot = useAgentComponent<TestComponentProps>(registration);

  if (snapshot.status === "success") {
    return <output>{snapshot.props.items.join(", ")}</output>;
  }
  return <output>{snapshot.status}</output>;
}

describe("useAgentComponent", () => {
  test("registers an arbitrary component and renders lifecycle updates", async () => {
    const pending = deferred<string[]>();
    const controller = new AgentComponentController();
    const registration = testRegistration("products", { execute: () => pending.promise });
    render(
      <AgentComponentProvider controller={controller}>
        <HookView registration={registration} />
      </AgentComponentProvider>,
    );
    await waitFor(() => expect(controller.getManifest().components).toHaveLength(1));

    let execution!: Promise<unknown>;
    act(() => {
      execution = controller.execute({
        componentId: "products",
        toolKey: "load-items",
        input: { query: "keyboard" },
      });
    });
    expect(screen.getByText("loading")).toBeTruthy();

    await act(async () => {
      pending.resolve(["Keyboard"]);
      await execution;
    });
    expect(screen.getByText("Keyboard")).toBeTruthy();
  });

  test("subscribes only to the targeted component instance", async () => {
    const controller = new AgentComponentController();
    const firstRender = mock(() => undefined);
    const secondRender = mock(() => undefined);
    render(
      <AgentComponentProvider controller={controller}>
        <HookView registration={testRegistration("first")} onRender={firstRender} />
        <HookView registration={testRegistration("second")} onRender={secondRender} />
      </AgentComponentProvider>,
    );
    await waitFor(() => expect(controller.getManifest().components).toHaveLength(2));
    const secondRenderCount = secondRender.mock.calls.length;

    await act(async () => {
      await controller.execute({
        componentId: "first",
        toolKey: "load-items",
        input: { query: "only first" },
      });
    });

    expect(firstRender.mock.calls.length).toBeGreaterThan(1);
    expect(secondRender).toHaveBeenCalledTimes(secondRenderCount);
  });

  test("updates registration metadata without transient duplicates", async () => {
    const controller = new AgentComponentController();
    const initial = testRegistration("products");
    const { rerender } = render(
      <AgentComponentProvider controller={controller}>
        <HookView registration={initial} />
      </AgentComponentProvider>,
    );
    await waitFor(() => expect(controller.getManifest().components).toHaveLength(1));

    rerender(
      <AgentComponentProvider controller={controller}>
        <HookView
          registration={{ ...initial, instructions: "Use the updated product guidance." }}
        />
      </AgentComponentProvider>,
    );

    await waitFor(() =>
      expect(controller.getManifest().components[0]?.instructions).toBe(
        "Use the updated product guidance.",
      ),
    );
    expect(controller.getManifest().components).toHaveLength(1);
  });
});
