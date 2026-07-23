import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";

import { AgentComponentController } from "../../src/core/index.js";
import { AgentComponentProvider, useAgentComponent } from "../../src/react/index.js";
import { testRegistration } from "../helpers/component.js";

function ServerView() {
  const snapshot = useAgentComponent(testRegistration("server-products"));
  return <div>{snapshot.status}</div>;
}

describe("server rendering", () => {
  test("returns idle without registering or executing tools", () => {
    const controller = new AgentComponentController();

    expect(
      renderToString(
        <AgentComponentProvider controller={controller}>
          <ServerView />
        </AgentComponentProvider>,
      ),
    ).toContain("idle");
    expect(controller.getManifest().components).toHaveLength(0);
  });
});
