"use client";

import { AgentDevtools } from "@nom-ai/sdk/devtools";

import { labDevtoolsTabs } from "../lib/devtools-tabs";

/**
 * The only module in this example that imports `@nom-ai/sdk/devtools`.
 *
 * Keeping the import here, behind the dynamic boundary in `devtools-mount.tsx`, is what
 * makes the panel's code and styles absent from a build that never turns devtools on.
 * The panel needs no per-component wiring: it discovers every registered component through
 * the controller it resolves from `AgentComponentProvider`.
 */
export default function DevtoolsPanel() {
  return <AgentDevtools additionalTabs={labDevtoolsTabs} />;
}
