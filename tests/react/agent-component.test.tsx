import { describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";

import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponent, AgentComponentProvider } from "../../src/react/index.js";
import { testRegistration } from "../helpers/component.js";

describe("AgentComponent", () => {
  test("exposes lifecycle and mapped props through a render prop", async () => {
    const controller = new AgentComponentController();
    const registration = testRegistration("sales");
    render(
      <AgentComponentProvider controller={controller}>
        <AgentComponent {...registration}>
          {(snapshot) =>
            snapshot.status === "success" ? (
              <div>{snapshot.props.items.join(", ")}</div>
            ) : (
              <div>{snapshot.status}</div>
            )
          }
        </AgentComponent>
      </AgentComponentProvider>,
    );
    await waitFor(() => expect(controller.getManifest().components).toHaveLength(1));

    await act(async () => {
      await controller.execute({
        componentId: "sales",
        toolKey: "load-items",
        input: { query: "Today's sales" },
      });
    });

    expect(screen.getByText("Today's sales")).toBeTruthy();
  });
});
