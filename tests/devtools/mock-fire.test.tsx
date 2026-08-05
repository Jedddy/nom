import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";

import type { AgentComponentRegistration } from "../../src/core/index.js";
import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponent, AgentComponentProvider } from "../../src/react/index.js";
import { AgentDevtools, DEVTOOLS_CONTAINER_ATTRIBUTE } from "../../src/devtools/index.js";
import { testRegistration, type TestComponentProps } from "../helpers/component.js";

/**
 * Resolves the shadow root the panel renders into.
 *
 * `@testing-library` queries do not cross a shadow boundary, so every panel assertion scopes
 * itself to the root through `within`, exactly as the shell's own suite does.
 */
function devtoolsRoot(): ShadowRoot {
  const container = document.querySelector(`[${DEVTOOLS_CONTAINER_ATTRIBUTE}]`);
  if (!container) {
    throw new Error("The devtools container was not mounted.");
  }

  const root = (container as HTMLElement).shadowRoot;
  if (!root) {
    throw new Error("The devtools container carries no shadow root.");
  }
  return root;
}

/** Scopes testing-library queries to the panel's shadow root. */
function panel() {
  return within(devtoolsRoot() as unknown as HTMLElement);
}

/**
 * The drawer's rendered text, excluding the shadow root's stylesheet.
 *
 * The stylesheet names every class the panel can ever use, mock-fire's included, so an
 * absence assertion has to read the rendered tree rather than the whole root.
 */
function drawerText(): string {
  return devtoolsRoot().querySelector(".nom-drawer")?.textContent ?? "";
}

function launcher(): HTMLElement {
  return panel().getByRole("button", { name: /Agent devtools/ });
}

function expand(): void {
  fireEvent.click(launcher());
}

function openTab(name: string): void {
  fireEvent.click(panel().getByRole("tab", { name }));
}

function tabNames(): string[] {
  return panel()
    .getAllByRole("tab")
    .map((tab) => tab.textContent ?? "");
}

function componentSelect(): HTMLSelectElement {
  return panel().getByLabelText("Component") as HTMLSelectElement;
}

function toolSelect(): HTMLSelectElement {
  return panel().getByLabelText("Tool") as HTMLSelectElement;
}

function outputField(): HTMLTextAreaElement {
  return panel().getByLabelText("Mock output (JSON)") as HTMLTextAreaElement;
}

function applyButton(): HTMLButtonElement {
  return panel().getByRole("button", { name: /Apply mock output/ }) as HTMLButtonElement;
}

function chooseTarget(componentId: string, toolKey: string): void {
  fireEvent.change(componentSelect(), { target: { value: componentId } });
  fireEvent.change(toolSelect(), { target: { value: toolKey } });
}

function enterOutput(text: string): void {
  fireEvent.change(outputField(), { target: { value: text } });
}

async function applyMock(): Promise<void> {
  await act(async () => {
    fireEvent.click(applyButton());
  });
}

/** Renders one registered component's snapshot into the host document, outside the panel. */
function ComponentState({
  registration,
}: {
  readonly registration: AgentComponentRegistration<TestComponentProps>;
}) {
  return (
    <AgentComponent {...registration}>
      {(snapshot) => (
        <p data-testid={`state-${registration.id}`}>
          {snapshot.status === "success"
            ? `success: ${snapshot.props.items.join(", ")}`
            : snapshot.status === "failure"
              ? `failure: ${snapshot.error.code}`
              : snapshot.status}
        </p>
      )}
    </AgentComponent>
  );
}

function renderHarness(
  controller: AgentComponentController,
  registrations: readonly AgentComponentRegistration<TestComponentProps>[] = [],
) {
  return render(
    <AgentComponentProvider controller={controller}>
      {registrations.map((registration) => (
        <ComponentState key={registration.id} registration={registration} />
      ))}
      <AgentDevtools />
    </AgentComponentProvider>,
  );
}

function mockFireController(): AgentComponentController {
  return new AgentComponentController({ devtools: { mockFire: true } });
}

describe("MockFire", () => {
  afterEach(cleanup);

  test("is absent, not disabled, while mock-fire is off", async () => {
    // Devtools are on and the panel is mounted; only mock-fire was never opted into.
    const controller = new AgentComponentController({ devtools: {} });
    const sales = testRegistration("sales");
    renderHarness(controller, [sales]);
    await act(async () => {
      await controller.execute({
        componentId: "sales",
        toolKey: "load-items",
        input: { query: "Q1" },
      });
    });

    expand();

    expect(tabNames()).toEqual(["Timeline", "Manifest"]);
    expect(panel().queryByRole("tab", { name: "Mock fire" })).toBeNull();
    // Not merely hidden from the accessibility tree, and not rendered inert either.
    expect(panel().queryAllByRole("tab", { hidden: true })).toHaveLength(2);
    expect(devtoolsRoot().querySelectorAll("[disabled], [aria-disabled='true']")).toHaveLength(0);
    expect(devtoolsRoot().querySelectorAll("select, textarea")).toHaveLength(0);
    expect(drawerText()).not.toMatch(/mock/i);

    // The read-only views still render.
    expect(panel().getByRole("list", { name: "Tool requests" })).toBeTruthy();
    openTab("Manifest");
    expect(panel().getByRole("list", { name: "Mounted components" })).toBeTruthy();
  });

  test("offers the control once mock-fire is enabled", () => {
    const controller = mockFireController();
    renderHarness(controller, [testRegistration("sales")]);
    expand();

    expect(tabNames()).toEqual(["Timeline", "Manifest", "Mock fire"]);
    openTab("Mock fire");
    expect(componentSelect()).toBeTruthy();
    expect(outputField()).toBeTruthy();
  });

  test("applies a valid output through the real path, mapping props onto the component", async () => {
    const controller = mockFireController();
    const view = renderHarness(controller, [testRegistration("sales")]);
    expand();
    openTab("Mock fire");

    chooseTarget("sales", "load-items");
    enterOutput('["Keyboard", "Mouse"]');
    await applyMock();

    expect(view.getByTestId("state-sales").textContent).toBe("success: Keyboard, Mouse");
    const detail = within(
      panel().getByRole("region", { name: /Request detail: sales load-items/ }),
    );
    expect(detail.getByText("Succeeded")).toBeTruthy();
  });

  test("puts the component in its failure state when the output schema rejects it", async () => {
    const controller = mockFireController();
    const view = renderHarness(controller, [testRegistration("sales")]);
    expand();
    openTab("Mock fire");

    chooseTarget("sales", "load-items");
    enterOutput('{"not":"items"}');
    await applyMock();

    // The rejection is the intended outcome, so the component fails exactly as a real call
    // with that payload would, and the timeline reports where it was rejected.
    expect(view.getByTestId("state-sales").textContent).toBe("failure: invalid-output");
    const detail = within(
      panel().getByRole("region", { name: /Request detail: sales load-items/ }),
    );
    expect(detail.getByText("Failed: invalid-output")).toBeTruthy();
    expect(detail.getByText("Output validation")).toBeTruthy();
    // The panel reports it through the timeline rather than restating it on the control.
    expect(panel().queryByRole("alert")).toBeNull();
  });

  test("puts the component in its empty state when the mapper returns empty", async () => {
    const controller = mockFireController();
    const view = renderHarness(controller, [testRegistration("sales")]);
    expand();
    openTab("Mock fire");

    chooseTarget("sales", "load-items");
    enterOutput("[]");
    await applyMock();

    expect(view.getByTestId("state-sales").textContent).toBe("empty");
    const detail = within(
      panel().getByRole("region", { name: /Request detail: sales load-items/ }),
    );
    expect(detail.getByText("Empty")).toBeTruthy();
  });

  test("rejects malformed entry text before it reaches the controller and keeps it", async () => {
    const controller = mockFireController();
    const view = renderHarness(controller, [testRegistration("sales")]);
    expand();
    openTab("Mock fire");

    chooseTarget("sales", "load-items");
    enterOutput("{oops");
    await applyMock();

    expect(panel().getByRole("alert").textContent).toContain("not valid JSON");
    expect(outputField().value).toBe("{oops");
    expect(panel().getByRole("tab", { name: "Mock fire" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    // Nothing reached the pipeline, so the component never left idle and nothing was recorded.
    expect(view.getByTestId("state-sales").textContent).toBe("idle");
    expect(launcher().textContent).toContain("0 requests");
  });

  test("keeps the apply control disabled until a component and a tool are selected", () => {
    const controller = mockFireController();
    renderHarness(controller, [testRegistration("sales")]);
    expand();
    openTab("Mock fire");

    expect(applyButton().disabled).toBe(true);
    expect(toolSelect().disabled).toBe(true);

    fireEvent.change(componentSelect(), { target: { value: "sales" } });
    expect(applyButton().disabled).toBe(true);
    expect(toolSelect().disabled).toBe(false);

    fireEvent.change(toolSelect(), { target: { value: "load-items" } });
    expect(applyButton().disabled).toBe(false);
  });

  test("moves to the timeline with the new entry selected on a successful apply", async () => {
    const controller = mockFireController();
    renderHarness(controller, [testRegistration("sales")]);
    await act(async () => {
      await controller.execute({
        componentId: "sales",
        toolKey: "load-items",
        input: { query: "earlier" },
      });
    });

    expand();
    openTab("Mock fire");
    chooseTarget("sales", "load-items");
    enterOutput('["Applied"]');
    await applyMock();

    expect(panel().getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    const rows = panel().getAllByRole("button", { name: /load-items/ });
    expect(rows).toHaveLength(2);
    // The earlier request is untouched; the entry the apply produced is the selected one.
    expect(rows[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(rows[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(panel().getByRole("region", { name: /Request detail: sales load-items/ })).toBeTruthy();
  });

  test("reports an unregistered target instead of throwing", async () => {
    const controller = mockFireController();
    const handle = controller.register(testRegistration("sales"));
    renderHarness(controller);
    expand();
    openTab("Mock fire");

    chooseTarget("sales", "load-items");
    enterOutput('["Widget"]');

    // The component goes away between the choice and the apply.
    act(() => {
      handle.unregister();
    });
    await applyMock();

    expect(panel().getByRole("alert").textContent).toContain(
      'Component "sales" is not registered.',
    );
    expect(outputField().value).toBe('["Widget"]');
    // The controller rejected before starting a request, so there is nothing to show.
    expect(launcher().textContent).toContain("0 requests");
  });
});
