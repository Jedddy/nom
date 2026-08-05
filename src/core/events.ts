import type { AgentComponentErrorCode } from "./errors.js";
import type { AgentValueSummary } from "./summarize.js";

/**
 * Stable stage and outcome names carried by pipeline events.
 *
 * The union is open: later releases may add stage and outcome names, so consumers
 * must fall through unrecognized values instead of switching exhaustively.
 */
export type AgentPipelineEventType =
  | "request-started"
  | "input-validated"
  | "authorized"
  | "executed"
  | "output-validated"
  | "mapped"
  | "request-succeeded"
  | "request-empty"
  | "request-failed";

/** One path into the value a schema rejected, carrying no rejected value. */
export type AgentPipelineIssuePath = readonly (string | number)[];

/**
 * A payload attached to a stage event.
 *
 * Structural mode carries an {@link AgentValueSummary}, which reports types and sizes but
 * no values; verbatim mode carries the host value unchanged, so a consumer that reads a
 * payload must narrow it rather than assume a summary. The field is absent entirely when
 * the controller had no reason to describe the payload.
 */
export type AgentPipelinePayload = AgentValueSummary | unknown;

/** Identity every pipeline event carries, regardless of stage. */
export interface AgentPipelineEventContext {
  readonly componentId: string;
  readonly toolKey: string;
  readonly requestId: string;
  /** Milliseconds since the epoch, taken when the stage completed. */
  readonly timestamp: number;
}

/** Reports an accepted request entering the pipeline and the state it replaced. */
export interface AgentRequestStartedEvent extends AgentPipelineEventContext {
  readonly type: "request-started";
  /** The still-active request this one aborted, when it superseded one. */
  readonly supersededRequestId?: string;
  /** Whether the published loading snapshot carries props from a prior success. */
  readonly hasPreviousProps: boolean;
}

/** Reports that the request input satisfied the tool input schema. */
export interface AgentInputValidatedEvent extends AgentPipelineEventContext {
  readonly type: "input-validated";
  /** The schema-accepted input, described or forwarded per the controller's payload mode. */
  readonly input?: AgentPipelinePayload;
}

/** Reports that the host authorization policy approved the request. */
export interface AgentAuthorizedEvent extends AgentPipelineEventContext {
  readonly type: "authorized";
}

/** Reports that the registered local executor returned output. */
export interface AgentExecutedEvent extends AgentPipelineEventContext {
  readonly type: "executed";
}

/** Reports that the tool output satisfied the tool output schema. */
export interface AgentOutputValidatedEvent extends AgentPipelineEventContext {
  readonly type: "output-validated";
  /** The schema-accepted output, described or forwarded per the controller's payload mode. */
  readonly output?: AgentPipelinePayload;
}

/** Reports that the developer mapper produced a component result. */
export interface AgentMappedEvent extends AgentPipelineEventContext {
  readonly type: "mapped";
  /** The mapped props, absent when the mapper deliberately produced no data. */
  readonly props?: AgentPipelinePayload;
}

/** Terminal event for a request that published mapped props. */
export interface AgentRequestSucceededEvent extends AgentPipelineEventContext {
  readonly type: "request-succeeded";
  /** The published props, described or forwarded per the controller's payload mode. */
  readonly props?: AgentPipelinePayload;
}

/** Terminal event for a request the mapper deliberately mapped to no data. */
export interface AgentRequestEmptyEvent extends AgentPipelineEventContext {
  readonly type: "request-empty";
}

/**
 * Terminal event for a failed, aborted, or superseded request.
 *
 * Carries the typed code and, for schema failures, issue paths only. Error messages,
 * cause chains, and schema issue messages are withheld because they echo rejected values.
 */
export interface AgentRequestFailedEvent extends AgentPipelineEventContext {
  readonly type: "request-failed";
  readonly code: AgentComponentErrorCode;
  /** Paths reported by the rejecting schema, present only when the schema supplied them. */
  readonly issuePaths?: readonly AgentPipelineIssuePath[];
}

/** Every stage and outcome the controller pipeline reports today. */
export type AgentPipelineEvent =
  | AgentRequestStartedEvent
  | AgentInputValidatedEvent
  | AgentAuthorizedEvent
  | AgentExecutedEvent
  | AgentOutputValidatedEvent
  | AgentMappedEvent
  | AgentRequestSucceededEvent
  | AgentRequestEmptyEvent
  | AgentRequestFailedEvent;

/** Receives pipeline events in the order the controller records them. */
export type AgentPipelineEventListener = (event: AgentPipelineEvent) => void;
