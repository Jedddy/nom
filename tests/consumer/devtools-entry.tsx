import { renderToString } from "react-dom/server";

import * as rootEntry from "@nom-ai/sdk";
import { AgentComponentController, AgentComponentProvider } from "@nom-ai/sdk";
import * as devtoolsEntry from "@nom-ai/sdk/devtools";
import { AgentDevtools } from "@nom-ai/sdk/devtools";

// Server rendering must never reach for the DOM. This runtime has no `document`, so make the
// absence load-bearing: any read throws here rather than silently passing on a host that does
// define one.
Object.defineProperty(globalThis, "document", {
  configurable: true,
  get(): never {
    throw new Error("The packed devtools entry read `document` during server rendering.");
  },
});

const controller = new AgentComponentController();
const html = renderToString(
  <AgentComponentProvider controller={controller}>
    <AgentDevtools />
  </AgentComponentProvider>,
);

// The panel attaches its shadow host in an effect, so a server render produces no markup at all.
if (html !== "") {
  throw new Error(`The packed devtools entry server-rendered markup: ${html}`);
}

// Only an explicit `@nom-ai/sdk/devtools` import pulls the panel in. Comparing the two
// namespaces keeps this honest as the devtools surface grows, rather than pinning one name.
if ("AgentDevtools" in rootEntry) {
  throw new Error("The packed root entry re-exports the devtools panel.");
}

// Guards the comparison below against passing vacuously on an empty namespace.
if (!("AgentDevtools" in devtoolsEntry)) {
  throw new Error("The packed devtools entry did not expose the panel.");
}

const rootExports = new Set(Object.keys(rootEntry));
const leaked = Object.keys(devtoolsEntry).filter((name) => rootExports.has(name));
if (leaked.length > 0) {
  throw new Error(`The packed root entry exposes devtools symbols: ${leaked.join(", ")}`);
}

console.log("Packed devtools entry, declarations, and empty SSR output passed.");
