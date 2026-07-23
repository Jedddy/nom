import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";

import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponentProvider, useAgentComponentController } from "../../src/react/index.js";

function ControllerIdentity({ expected }: { readonly expected: AgentComponentController }) {
  const controller = useAgentComponentController();
  return <output>{controller === expected ? "same" : "different"}</output>;
}

describe("AgentComponentProvider", () => {
  test("provides the host-owned controller", () => {
    const controller = new AgentComponentController();

    render(
      <AgentComponentProvider controller={controller}>
        <ControllerIdentity expected={controller} />
      </AgentComponentProvider>,
    );

    expect(screen.getByText("same")).toBeTruthy();
  });

  test("fails clearly when a binding is rendered without a provider", () => {
    expect(() => render(<ControllerIdentity expected={new AgentComponentController()} />)).toThrow(
      "Agent components must be rendered inside AgentComponentProvider.",
    );
  });
});
