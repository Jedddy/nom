import { describe, expect, test } from "bun:test";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponentProvider, useAgentComponent } from "../../src/react/index.js";
import { testRegistration } from "../helpers/component.js";

function RegisteredView() {
  useAgentComponent(testRegistration("strict-products"));
  return null;
}

describe("React Strict Mode", () => {
  test("does not leak or remove the current registration", async () => {
    const controller = new AgentComponentController();
    const view = render(
      <StrictMode>
        <AgentComponentProvider controller={controller}>
          <RegisteredView />
        </AgentComponentProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(controller.getManifest().components).toHaveLength(1));
    view.unmount();
    expect(controller.getManifest().components).toHaveLength(0);
  });
});
