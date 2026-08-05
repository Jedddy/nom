/**
 * Host-side switches the lab uses to steer a request into a specific pipeline outcome.
 *
 * These are deliberately not part of any tool input schema. A model must never be able to
 * ask for a broken response, and the point of the example is that every event in the panel
 * comes from the ordinary pipeline — the fault is injected by the host around the request,
 * the same way a flaky API or a bad mapper would behave in production.
 *
 * Module-level state is what makes that possible: a tool executor receives only the
 * validated model input, so anything host-owned has to reach it from outside the call.
 */

/** The outcome the next request is steered towards. */
export type AgentFault =
  "none" | "empty" | "invalid-output" | "execution-failure" | "mapping-failure" | "slow";

let activeFault: AgentFault = "none";
let hostApprovalGranted = false;

/** Steers the next request; the fault stays active until it is changed again. */
export function setAgentFault(fault: AgentFault): void {
  activeFault = fault;
}

/** Reads the active fault from inside a tool executor or output mapper. */
export function currentAgentFault(): AgentFault {
  return activeFault;
}

/**
 * Grants or withdraws host approval for approval-required tools.
 *
 * The controller's `authorize` policy reads this. Withdrawing it is how the lab produces
 * an `authorization-denied` terminal without a failing data source.
 */
export function setHostApproval(granted: boolean): void {
  hostApprovalGranted = granted;
}

/** Reads the current host approval decision. */
export function isHostApprovalGranted(): boolean {
  return hostApprovalGranted;
}
