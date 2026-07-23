import type { AgentComponentErrorCode } from "./errors.js";

/** Snapshot before a component has accepted a request. */
export interface AgentComponentIdleSnapshot {
  readonly status: "idle";
}

/** Snapshot while a component tool request is active. */
export interface AgentComponentLoadingSnapshot<TProps> {
  readonly status: "loading";
  readonly requestId: string;
  readonly previousProps?: TProps;
}

/** Snapshot containing validated props mapped from a successful tool result. */
export interface AgentComponentSuccessSnapshot<TProps> {
  readonly status: "success";
  readonly requestId: string;
  readonly props: TProps;
}

/** Snapshot for a tool result explicitly mapped to no displayable data. */
export interface AgentComponentEmptySnapshot {
  readonly status: "empty";
  readonly requestId: string;
}

/** Safe render-facing error information. */
export interface AgentComponentFailure {
  readonly code: AgentComponentErrorCode;
  readonly message: string;
}

/** Snapshot for a failed component tool request. */
export interface AgentComponentFailureSnapshot {
  readonly status: "failure";
  readonly requestId: string;
  readonly error: AgentComponentFailure;
}

/** The complete lifecycle state exposed to a registered component. */
export type AgentComponentSnapshot<TProps = unknown> =
  | AgentComponentIdleSnapshot
  | AgentComponentLoadingSnapshot<TProps>
  | AgentComponentSuccessSnapshot<TProps>
  | AgentComponentEmptySnapshot
  | AgentComponentFailureSnapshot;

/** Shared immutable idle snapshot. */
export const idleSnapshot: AgentComponentIdleSnapshot = Object.freeze({ status: "idle" });

const failureMessages: Readonly<Record<AgentComponentErrorCode, string>> = Object.freeze({
  aborted: "The request was superseded or cancelled.",
  "adapter-failed": "The AI adapter could not apply the request.",
  "authorization-denied": "The host application denied this request.",
  "duplicate-registration": "The component is already registered.",
  "execution-failed": "The tool could not complete the request.",
  "invalid-input": "The request input is invalid.",
  "invalid-output": "The tool returned an invalid result.",
  "invalid-registration": "The component registration is invalid.",
  "mapping-failed": "The result could not be applied to the component.",
  "projection-failed": "The result could not be projected for the model.",
  "registration-unavailable": "The target component is unavailable.",
  "tool-unavailable": "The requested tool is unavailable.",
});

/** Creates a redacted immutable failure snapshot for rendering. */
export function createFailureSnapshot(
  requestId: string,
  code: AgentComponentErrorCode,
): AgentComponentFailureSnapshot {
  return Object.freeze({
    status: "failure",
    requestId,
    error: Object.freeze({ code, message: failureMessages[code] }),
  });
}
