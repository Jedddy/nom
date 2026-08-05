import { describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import type { AgentOutputSchema } from "../../src/core/contracts.js";
import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponentProvider } from "../../src/react/index.js";
import { AgentDevtools, DEVTOOLS_CONTAINER_ATTRIBUTE } from "../../src/devtools/index.js";
import type { AgentDevtoolsTab } from "../../src/devtools/index.js";
import { testRegistration } from "../helpers/component.js";
import { deferred } from "../helpers/deferred.js";

/**
 * Resolves the shadow root the panel renders into.
 *
 * `@testing-library` queries do not cross a shadow boundary, so every assertion scopes
 * itself to the root through `within`, which accepts any node with `querySelectorAll`.
 * This is the query path U5 and U6 build on.
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

function launcher(): HTMLElement {
  return panel().getByRole("button", { name: /Agent devtools/ });
}

function expand(): void {
  fireEvent.click(launcher());
}

function renderPanel(
  controller: AgentComponentController | null,
  props: { readonly additionalTabs?: readonly AgentDevtoolsTab[] } = {},
) {
  const element = <AgentDevtools {...props} />;
  return render(
    controller === null ? (
      element
    ) : (
      <AgentComponentProvider controller={controller}>{element}</AgentComponentProvider>
    ),
  );
}

function rowTexts(): string[] {
  return panel()
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

async function runRequest(
  controller: AgentComponentController,
  componentId: string,
  query: string,
  requestId?: string,
): Promise<void> {
  await act(async () => {
    await controller
      .execute({
        componentId,
        toolKey: "load-items",
        input: { query },
        ...(requestId === undefined ? {} : { requestId }),
      })
      .catch(() => undefined);
  });
}

describe("AgentDevtools", () => {
  test("renders into a shadow root on a document-level container", () => {
    renderPanel(new AgentComponentController({ devtools: {} }));

    const container = document.querySelector(`[${DEVTOOLS_CONTAINER_ATTRIBUTE}]`) as HTMLElement;
    expect(container.parentElement).toBe(document.body);
    expect(container.shadowRoot).toBeTruthy();
    expect(container.style.zIndex).toBe("2147483000");
    expect(devtoolsRoot().querySelector("style")?.textContent).toContain(".nom-launcher");
    // The panel's markup is invisible to a document-scoped query, which is the point of KTD6.
    expect(document.body.textContent).not.toContain("Agent devtools");
    expect(launcher()).toBeTruthy();
    cleanup();
  });

  test("reports the active payload mode", () => {
    renderPanel(new AgentComponentController({ devtools: { verbatimPayloads: true } }));
    expand();
    expect(panel().getByText("Payload values: verbatim")).toBeTruthy();
    cleanup();

    renderPanel(new AgentComponentController({ devtools: {} }));
    expand();
    expect(panel().getByText("Payload values: summarized")).toBeTruthy();
    cleanup();
  });

  test("renders collapsed with no timeline content until expanded", async () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(testRegistration("sales"));
    renderPanel(controller);
    await runRequest(controller, "sales", "Q1 sales");

    expect(panel().queryByRole("list", { name: "Tool requests" })).toBeNull();
    expect(panel().queryByRole("tablist")).toBeNull();
    expect(launcher().textContent).toContain("1 request");

    expand();
    expect(panel().getByRole("list", { name: "Tool requests" })).toBeTruthy();
    cleanup();
  });

  test("orders sequential requests chronologically and labels the superseded one", async () => {
    const first = deferred<string[]>();
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(
      testRegistration("results", {
        execute: ({ query }) => (query === "older" ? first.promise : ["Newer"]),
      }),
    );
    renderPanel(controller);

    await act(async () => {
      const older = controller
        .execute({
          componentId: "results",
          toolKey: "load-items",
          input: { query: "older" },
          requestId: "older",
        })
        .catch(() => undefined);
      const newer = controller.execute({
        componentId: "results",
        toolKey: "load-items",
        input: { query: "newer" },
        requestId: "newer",
      });
      await newer;
      first.resolve(["Older"]);
      await older;
    });

    expand();
    const rows = rowTexts();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Superseded");
    expect(rows[0]).not.toContain("Failed");
    expect(rows[0]).not.toContain("aborted");
    expect(rows[1]).toContain("Succeeded");
    cleanup();
  });

  test("labels a request that carried previous props as showing prior content", async () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(testRegistration("sales"));
    renderPanel(controller);

    await runRequest(controller, "sales", "first");
    await runRequest(controller, "sales", "second");

    expand();
    const rows = rowTexts();
    expect(rows[0]).not.toContain("Showing prior content");
    expect(rows[1]).toContain("Showing prior content");
    expect(rows.join(" ")).not.toMatch(/stale/i);
    cleanup();
  });

  test("shows elapsed time for the stages each request reached", async () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(
      testRegistration("sales", {
        execute: () => {
          throw new Error("executor exploded");
        },
      }),
    );
    controller.register(testRegistration("orders"));
    renderPanel(controller);

    await runRequest(controller, "sales", "boom");
    await runRequest(controller, "orders", "fine");

    expand();
    const [failedRow, succeededRow] = rowTexts();

    expect(failedRow).toMatch(/Started \d+ ms/);
    expect(failedRow).toMatch(/Input validated \d+ ms/);
    expect(failedRow).toMatch(/Authorized \d+ ms/);
    expect(failedRow).toMatch(/Failed \d+ ms/);
    // The failing request never reached execution, mapping, or output validation.
    expect(failedRow).not.toContain("Executed");
    expect(failedRow).not.toContain("Output validated");
    expect(failedRow).not.toContain("Mapped");

    expect(succeededRow).toMatch(/Output validated \d+ ms/);
    expect(succeededRow).toMatch(/Mapped \d+ ms/);
    cleanup();
  });

  test("shows requests from two components in one timeline", async () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(testRegistration("sales"));
    controller.register(testRegistration("orders"));
    renderPanel(controller);

    await runRequest(controller, "sales", "sales query");
    await runRequest(controller, "orders", "orders query");

    expand();
    const rows = rowTexts();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("sales · load-items");
    expect(rows[1]).toContain("orders · load-items");
    cleanup();
  });

  test("opens a detail view naming the rejecting stage and the recorded output", async () => {
    const rejectingOutput: AgentOutputSchema<readonly string[]> = {
      "~standard": {
        version: 1,
        vendor: "nom-devtools-test",
        validate: () => ({ issues: [{ message: "Expected string items", path: ["items", 0] }] }),
      },
    };
    const controller = new AgentComponentController({ devtools: {} });
    const base = testRegistration("sales");
    const tool = base.tools[0];
    if (!tool) {
      throw new Error("The test registration lost its tool.");
    }
    controller.register({ ...base, tools: [{ ...tool, outputSchema: rejectingOutput }] });
    controller.register(testRegistration("orders"));
    renderPanel(controller);

    await runRequest(controller, "sales", "rejected");
    await runRequest(controller, "orders", "accepted");

    expand();
    const rows = panel().getAllByRole("button", { name: /load-items/ });
    fireEvent.click(rows[0] as HTMLElement);

    const detail = within(panel().getByRole("region", { name: /Request detail: sales/ }));
    expect(detail.getByText("Failed: invalid-output")).toBeTruthy();
    expect(detail.getByText("Output validation")).toBeTruthy();
    expect(detail.getByText(/Rejected by the output schema at items\.0/)).toBeTruthy();
    expect(detail.getByText(/object\(1\) \{ query: string \}/)).toBeTruthy();

    // A request that reached output validation shows its summarized output value.
    fireEvent.click(rows[1] as HTMLElement);
    const accepted = within(panel().getByRole("region", { name: /Request detail: orders/ }));
    expect(accepted.getByText("array(1) [string]")).toBeTruthy();
    expect(accepted.getByText(/object\(1\) \{ items: array\(1\) \[string\] \}/)).toBeTruthy();
    cleanup();
  });

  test("switches tabs, rendering only the active view", () => {
    const probeTab: AgentDevtoolsTab = {
      id: "probe",
      label: "Probe",
      render: () => <p>probe view body</p>,
    };
    renderPanel(new AgentComponentController({ devtools: {} }), { additionalTabs: [probeTab] });
    expand();

    expect(panel().getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(panel().queryByText("probe view body")).toBeNull();
    expect(panel().getByText(/No tool requests have been recorded yet/)).toBeTruthy();

    fireEvent.click(panel().getByRole("tab", { name: "Probe" }));

    expect(panel().getByText("probe view body")).toBeTruthy();
    expect(panel().queryByText(/No tool requests have been recorded yet/)).toBeNull();
    expect(panel().getByRole("tab", { name: "Probe" }).getAttribute("aria-selected")).toBe("true");
    cleanup();
  });

  test("expands from the keyboard-focused launcher and collapses on Escape", () => {
    renderPanel(new AgentComponentController({ devtools: {} }));
    const root = devtoolsRoot();
    const button = launcher();

    // A native button is keyboard-operable, so focusing and activating it is the keyboard path.
    button.focus();
    expect(root.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(launcher().getAttribute("aria-expanded")).toBe("true");

    const firstControl = panel().getByRole("tab", { name: "Timeline" });
    expect(root.activeElement).toBe(firstControl);

    fireEvent.keyDown(firstControl, { key: "Escape" });

    expect(panel().queryByRole("tablist")).toBeNull();
    expect(root.activeElement).toBe(launcher());
    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    cleanup();
  });

  test("explains a missing provider instead of throwing", () => {
    expect(() => renderPanel(null)).not.toThrow();

    expand();
    expect(panel().getByText(/No AgentComponentProvider was found/)).toBeTruthy();
    expect(panel().queryByText(/Payload values/)).toBeNull();
    cleanup();
  });

  test("distinguishes a controller without devtools options from one with no activity", () => {
    renderPanel(new AgentComponentController());
    expand();
    const disabled = panel().getByText(/Devtools are not enabled on this controller/);
    expect(disabled.textContent).toContain("new AgentComponentController({ devtools: {} })");
    cleanup();

    renderPanel(new AgentComponentController({ devtools: {} }));
    expand();
    expect(panel().getByText(/No tool requests have been recorded yet/)).toBeTruthy();
    cleanup();
  });

  test("renders no markup on the server and does not touch document", () => {
    const controller = new AgentComponentController({ devtools: {} });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    if (!descriptor) {
      throw new Error("The DOM harness did not define document.");
    }

    let touched = false;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      get() {
        touched = true;
        return descriptor.value;
      },
    });

    let markup: string;
    try {
      markup = renderToString(
        <AgentComponentProvider controller={controller}>
          <AgentDevtools />
        </AgentComponentProvider>,
      );
    } finally {
      Object.defineProperty(globalThis, "document", descriptor);
    }

    expect(markup).toBe("");
    expect(touched).toBe(false);
    expect(document.querySelector(`[${DEVTOOLS_CONTAINER_ATTRIBUTE}]`)).toBeNull();
  });

  test("removes the container and unsubscribes on unmount", () => {
    const controller = new AgentComponentController({ devtools: {} });
    const subscribeEvents = controller.subscribeEvents.bind(controller);
    let unsubscribed = 0;
    controller.subscribeEvents = (listener) => {
      const unsubscribe = subscribeEvents(listener);
      return () => {
        unsubscribed += 1;
        unsubscribe();
      };
    };

    const view = renderPanel(controller);
    expect(document.querySelector(`[${DEVTOOLS_CONTAINER_ATTRIBUTE}]`)).toBeTruthy();

    view.unmount();

    expect(document.querySelector(`[${DEVTOOLS_CONTAINER_ATTRIBUTE}]`)).toBeNull();
    expect(unsubscribed).toBe(1);
  });
});
