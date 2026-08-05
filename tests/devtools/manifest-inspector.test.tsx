import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";

import { AgentComponentController, defineAgentTool } from "../../src/core/index.js";
import type { AgentComponentRegistration, AgentToolApproval } from "../../src/core/index.js";
import { AgentComponentProvider } from "../../src/react/index.js";
import { AgentDevtools, DEVTOOLS_CONTAINER_ATTRIBUTE } from "../../src/devtools/index.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";

/**
 * Resolves the shadow root the panel renders into.
 *
 * `@testing-library` queries do not cross a shadow boundary, so every assertion scopes
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

interface ManifestRegistrationOptions {
  readonly approval?: AgentToolApproval;
  readonly toolKey?: string;
  readonly description?: string;
  readonly jsonSchema?: Record<string, unknown>;
}

const DEFAULT_JSON_SCHEMA: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    query: { type: "string", description: "Words to match against item titles." },
    limit: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["query"],
  additionalProperties: false,
};

function manifestRegistration(
  id: string,
  options: ManifestRegistrationOptions = {},
): AgentComponentRegistration<{ readonly items: readonly string[] }> {
  return {
    id,
    instructions: `Show ${id} matching the user's query.`,
    tools: [
      defineAgentTool({
        key: options.toolKey ?? "load-items",
        description: options.description ?? `Load matching ${id} rows.`,
        inputSchema: inputSchema(
          (value) =>
            typeof value === "object" && value !== null && "query" in value
              ? { value: { query: String((value as { query: unknown }).query) } }
              : { issues: [{ message: "Expected a string query" }] },
          options.jsonSchema ?? DEFAULT_JSON_SCHEMA,
        ),
        outputSchema: outputSchema((value) =>
          Array.isArray(value)
            ? { value: value as string[] }
            : { issues: [{ message: "Expected string items" }] },
        ),
        ...(options.approval === undefined ? {} : { approval: options.approval }),
        execute: ({ query }) => [query],
        mapOutput: (items) => ({ status: "success", props: { items } }),
      }),
    ],
  };
}

/** Renders the panel, expands it, and selects the manifest tab. */
function openManifest(controller: AgentComponentController) {
  const view = render(
    <AgentComponentProvider controller={controller}>
      <AgentDevtools />
    </AgentComponentProvider>,
  );

  fireEvent.click(panel().getByRole("button", { name: /Agent devtools/ }));
  fireEvent.click(panel().getByRole("tab", { name: "Manifest" }));
  return view;
}

function tool(componentId: string, toolKey = "load-items") {
  return within(panel().getByRole("region", { name: `Tool: ${componentId} ${toolKey}` }));
}

describe("ManifestInspector", () => {
  // Unmounting between tests removes the panel's document-level container, so a later test
  // never queries a shadow root left behind by an earlier one.
  afterEach(cleanup);

  test("shows the id, instructions, description, approval flag, and input schema per tool", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("sales"));
    openManifest(controller);

    expect(panel().getByRole("heading", { name: "sales" })).toBeTruthy();
    expect(panel().getByText("Show sales matching the user's query.")).toBeTruthy();

    const entry = tool("sales");
    expect(entry.getByText("Load matching sales rows.")).toBeTruthy();
    expect(entry.getByText("Approval never")).toBeTruthy();

    // The generated schema is legible field by field, not only as raw JSON.
    expect(entry.getByText("query (required)")).toBeTruthy();
    expect(entry.getByText("limit (optional)")).toBeTruthy();
    expect(entry.getByText(/^— Words to match against item titles\.$/)).toBeTruthy();
    expect(entry.getByText("array of string")).toBeTruthy();

    // The schema itself is still shown verbatim, pretty-printed rather than on one line.
    const json = entry.getByText(/"additionalProperties"/).textContent ?? "";
    expect(json).toContain('"type": "object"');
    expect(json.split("\n").length).toBeGreaterThan(5);
  });

  test("adds a component registered after mount without remounting the view", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("sales"));
    openManifest(controller);

    const list = panel().getByRole("list", { name: "Mounted components" });
    expect(panel().queryByRole("heading", { name: "orders" })).toBeNull();

    act(() => {
      controller.register(manifestRegistration("orders"));
    });

    expect(panel().getByRole("heading", { name: "orders" })).toBeTruthy();
    expect(tool("orders").getByText("Load matching orders rows.")).toBeTruthy();
    // Same list node: the view re-rendered from the new snapshot rather than remounting.
    expect(panel().getByRole("list", { name: "Mounted components" })).toBe(list);
  });

  test("removes a component from the view when it unregisters", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("sales"));
    const orders = controller.register(manifestRegistration("orders"));
    openManifest(controller);

    expect(panel().getByRole("heading", { name: "orders" })).toBeTruthy();

    act(() => {
      orders.unregister();
    });

    expect(panel().queryByRole("heading", { name: "orders" })).toBeNull();
    expect(panel().queryByRole("region", { name: "Tool: orders load-items" })).toBeNull();
    expect(panel().getByRole("heading", { name: "sales" })).toBeTruthy();
  });

  test("distinguishes an approval-required tool from an approval-never one", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("checkout", { approval: "required" }));
    controller.register(manifestRegistration("sales", { approval: "never" }));
    openManifest(controller);

    const gated = tool("checkout").getByText("Approval required");
    const open = tool("sales").getByText("Approval never");

    expect(gated.className).toContain("nom-approval-required");
    expect(open.className).toContain("nom-approval-never");
    expect(gated.className).not.toContain("nom-approval-never");
    expect(gated.getAttribute("title")).toMatch(/must approve/);
    expect(open.getAttribute("title")).toMatch(/without host approval/);
  });

  test("states that the model sees no component tools when nothing is mounted", () => {
    openManifest(new AgentComponentController({ devtools: {} }));

    expect(panel().getByText(/the model currently sees no component tools/)).toBeTruthy();
    expect(panel().queryByRole("list", { name: "Mounted components" })).toBeNull();
  });

  test("reports a schema that declares no properties instead of implying fields", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("clock", { jsonSchema: {} }));
    openManifest(controller);

    const entry = tool("clock");
    expect(entry.getByText(/This schema declares no properties/)).toBeTruthy();
    expect(entry.getByText("{}")).toBeTruthy();
  });

  test("reads the manifest from a cached snapshot that only changes with registrations", () => {
    const controller = new AgentComponentController({ devtools: {} });
    controller.register(manifestRegistration("sales"));

    const first = controller.getManifest();
    expect(controller.getManifest()).toBe(first);

    const orders = controller.register(manifestRegistration("orders"));
    const second = controller.getManifest();
    expect(second).not.toBe(first);
    expect(controller.getManifest()).toBe(second);

    orders.unregister();
    expect(controller.getManifest()).not.toBe(second);
  });
});
