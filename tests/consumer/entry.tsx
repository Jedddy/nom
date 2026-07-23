import { renderToString } from "react-dom/server";

import { AgentComponentController, AgentComponentProvider } from "nom";

const controller = new AgentComponentController();
const html = renderToString(
  <AgentComponentProvider controller={controller}>
    <div>{controller.getSnapshot("consumer-component").status}</div>
  </AgentComponentProvider>,
);

if (!html.includes("idle")) {
  throw new Error("The packed React entry did not server-render the idle state.");
}

if (controller.getManifest().components.length !== 0) {
  throw new Error("Server rendering unexpectedly registered a component.");
}

console.log("Packed React ESM, declarations, and SSR passed.");
