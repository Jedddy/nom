import { AgentComponentController } from "@nom-ai/sdk";

import { isHostApprovalGranted } from "./lab-controls";

/**
 * Whether this build enables the devtools channel at all.
 *
 * The SDK cannot key this on your environment: it is built with `NODE_ENV` fixed to
 * `production`, so the packed package has no view of the consuming application's mode.
 * Gating the option here is the host discipline the docs ask for — `mockFire` in
 * particular lets anyone who can open the panel write schema-valid output into any
 * mounted component.
 */
const devtoolsEnabled = process.env.NEXT_PUBLIC_AGENT_DEVTOOLS === "on";

/**
 * Whether events carry raw values instead of structural summaries.
 *
 * Controller-wide and construction-time by design: it reaches every subscriber on this
 * controller, including the telemetry sink in `lib/agent-telemetry.ts`.
 */
const verbatimPayloads = process.env.NEXT_PUBLIC_AGENT_DEVTOOLS_PAYLOADS === "verbatim";

/** Builds the controller the lab mounts, with devtools enabled only when the build says so. */
export function createAgentController(): AgentComponentController {
  return new AgentComponentController({
    // Approval-required tools deny by default; the lab grants approval from the UI.
    authorize: ({ approval }) => approval === "never" || isHostApprovalGranted(),
    onError: ({ componentId, toolKey, error }) => {
      // Unchanged by the event stream. Failure events are a strict superset of this
      // callback: a superseded request emits an event here and never reaches `onError`.
      console.error(`[agent] ${componentId}.${toolKey} failed: ${error.code}`, error);
    },
    ...(devtoolsEnabled
      ? {
          devtools: {
            mockFire: true,
            verbatimPayloads,
            // Roughly the last sixty requests, since one successful request emits seven events.
            historyLimit: 400,
          },
        }
      : {}),
  });
}
