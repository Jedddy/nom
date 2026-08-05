import type { AgentComponentErrorCode } from "../core/errors.js";
import type { AgentPipelineEvent, AgentPipelineIssuePath } from "../core/events.js";

/** How a request ended, as the timeline presents it. */
export type AgentRequestOutcome = "pending" | "succeeded" | "empty" | "failed" | "superseded";

/** One pipeline stage a request reached, with the time it took to get there. */
export interface AgentRequestStage {
  /** The event type this stage came from; treated as an open union per KTD8. */
  readonly type: string;
  /** Human-readable stage name. */
  readonly label: string;
  /** Milliseconds since the epoch, taken when the stage completed. */
  readonly timestamp: number;
  /** Milliseconds since the previous stage of the same request; zero for the first. */
  readonly elapsedMs: number;
}

/** Every event recorded for one request id, grouped for display. */
export interface AgentRequestEntry {
  readonly requestId: string;
  readonly componentId: string;
  readonly toolKey: string;
  /** Timestamp of the request's first recorded event. */
  readonly startedAt: number;
  readonly outcome: AgentRequestOutcome;
  /** Outcome rendered for a reader, including the failure code when there is one. */
  readonly outcomeLabel: string;
  /** Typed failure code, present only for a failed, aborted, or superseded request. */
  readonly failureCode: AgentComponentErrorCode | undefined;
  /** The stage that rejected the request, derived from the failure code. */
  readonly rejectedStageLabel: string | undefined;
  /** Schema-reported paths into the rejected value; never the value itself, per R19. */
  readonly issuePaths: readonly AgentPipelineIssuePath[] | undefined;
  /** The request this one aborted, when it superseded an in-flight request. */
  readonly supersededRequestId: string | undefined;
  /**
   * Whether the loading snapshot carried props from a prior success.
   *
   * Presented as sanctioned prior content rather than as stale data, per R4.
   */
  readonly showsPriorContent: boolean;
  readonly stages: readonly AgentRequestStage[];
  /** Milliseconds from the first to the last recorded stage. */
  readonly totalElapsedMs: number;
  readonly hasInput: boolean;
  readonly input: unknown;
  readonly hasOutput: boolean;
  readonly output: unknown;
  readonly hasProps: boolean;
  readonly props: unknown;
}

const STAGE_LABELS: Readonly<Record<string, string>> = {
  "request-started": "Started",
  "input-validated": "Input validated",
  authorized: "Authorized",
  executed: "Executed",
  "output-validated": "Output validated",
  mapped: "Mapped",
  "request-succeeded": "Succeeded",
  "request-empty": "Empty",
  "request-failed": "Failed",
};

const REJECTED_STAGE_LABELS: Readonly<Record<string, string>> = {
  "invalid-input": "Input validation",
  "authorization-denied": "Authorization",
  "execution-failed": "Execution",
  "invalid-output": "Output validation",
  "mapping-failed": "Mapping",
  "projection-failed": "Model output projection",
  "tool-unavailable": "Tool resolution",
  "registration-unavailable": "Tool resolution",
  "adapter-failed": "Adapter",
};

/**
 * Names a stage or outcome, falling through to a humanized form for unknown types.
 *
 * KTD8 makes the event type an open union, so a type added in a later release must render
 * as something readable instead of disappearing from the timeline.
 */
export function stageLabel(type: string): string {
  return STAGE_LABELS[type] ?? humanize(type);
}

function humanize(type: string): string {
  const spaced = type.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface MutableEntry {
  readonly requestId: string;
  componentId: string;
  toolKey: string;
  startedAt: number;
  events: AgentPipelineEvent[];
  supersededRequestId: string | undefined;
  showsPriorContent: boolean;
}

/**
 * Groups recorded events into one entry per request id, in the order requests first appear.
 *
 * Events arrive in pipeline order, so first appearance is chronological order. A request
 * whose `aborted` terminal is matched by a later request naming it as superseded is
 * reported as superseded rather than failed: the abort was a deliberate replacement, not a
 * defect in the aborted request.
 */
export function buildRequestTimeline(
  events: readonly AgentPipelineEvent[],
): readonly AgentRequestEntry[] {
  const supersededIds = new Set<string>();
  for (const event of events) {
    if (event.type === "request-started" && event.supersededRequestId !== undefined) {
      supersededIds.add(event.supersededRequestId);
    }
  }

  const grouped = new Map<string, MutableEntry>();
  for (const event of events) {
    const existing = grouped.get(event.requestId);
    const entry: MutableEntry = existing ?? {
      requestId: event.requestId,
      componentId: event.componentId,
      toolKey: event.toolKey,
      startedAt: event.timestamp,
      events: [],
      supersededRequestId: undefined,
      showsPriorContent: false,
    };
    if (!existing) {
      grouped.set(event.requestId, entry);
    }

    entry.events.push(event);
    if (event.type === "request-started") {
      entry.supersededRequestId = event.supersededRequestId;
      entry.showsPriorContent = event.hasPreviousProps;
    }
  }

  return Object.freeze(
    [...grouped.values()].map((entry) => finalizeEntry(entry, supersededIds.has(entry.requestId))),
  );
}

function finalizeEntry(entry: MutableEntry, wasSuperseded: boolean): AgentRequestEntry {
  const terminal = entry.events.find(isTerminal);
  const failure = terminal?.type === "request-failed" ? terminal : undefined;
  const outcome = resolveOutcome(terminal, failure?.code, wasSuperseded);

  const stages: AgentRequestStage[] = [];
  let previousTimestamp = entry.startedAt;
  for (const event of entry.events) {
    stages.push({
      type: event.type,
      label:
        outcome === "superseded" && event.type === "request-failed"
          ? "Superseded"
          : stageLabel(event.type),
      timestamp: event.timestamp,
      elapsedMs: Math.max(0, event.timestamp - previousTimestamp),
    });
    previousTimestamp = event.timestamp;
  }

  const inputEvent = entry.events.find(
    (event): event is Extract<AgentPipelineEvent, { type: "input-validated" }> =>
      event.type === "input-validated",
  );
  const outputEvent = entry.events.find(
    (event): event is Extract<AgentPipelineEvent, { type: "output-validated" }> =>
      event.type === "output-validated",
  );
  const propsEvent = entry.events.find(
    (event): event is Extract<AgentPipelineEvent, { type: "request-succeeded" | "mapped" }> =>
      event.type === "request-succeeded" || event.type === "mapped",
  );

  return Object.freeze({
    requestId: entry.requestId,
    componentId: entry.componentId,
    toolKey: entry.toolKey,
    startedAt: entry.startedAt,
    outcome,
    outcomeLabel: outcomeLabel(outcome, failure?.code),
    failureCode: failure?.code,
    rejectedStageLabel: rejectedStageLabel(outcome, failure?.code),
    issuePaths: failure?.issuePaths,
    supersededRequestId: entry.supersededRequestId,
    showsPriorContent: entry.showsPriorContent,
    stages: Object.freeze(stages),
    totalElapsedMs: Math.max(0, previousTimestamp - entry.startedAt),
    hasInput: inputEvent !== undefined && "input" in inputEvent,
    input: inputEvent?.input,
    hasOutput: outputEvent !== undefined && "output" in outputEvent,
    output: outputEvent?.output,
    hasProps: propsEvent !== undefined && "props" in propsEvent,
    props: propsEvent?.props,
  });
}

function isTerminal(event: AgentPipelineEvent): boolean {
  return (
    event.type === "request-succeeded" ||
    event.type === "request-empty" ||
    event.type === "request-failed"
  );
}

function resolveOutcome(
  terminal: AgentPipelineEvent | undefined,
  code: AgentComponentErrorCode | undefined,
  wasSuperseded: boolean,
): AgentRequestOutcome {
  if (!terminal) {
    return "pending";
  }
  if (terminal.type === "request-succeeded") {
    return "succeeded";
  }
  if (terminal.type === "request-empty") {
    return "empty";
  }
  return code === "aborted" && wasSuperseded ? "superseded" : "failed";
}

function outcomeLabel(
  outcome: AgentRequestOutcome,
  code: AgentComponentErrorCode | undefined,
): string {
  switch (outcome) {
    case "succeeded":
      return "Succeeded";
    case "empty":
      return "Empty";
    case "superseded":
      return "Superseded";
    case "failed":
      return code ? `Failed: ${code}` : "Failed";
    default:
      return "In flight";
  }
}

function rejectedStageLabel(
  outcome: AgentRequestOutcome,
  code: AgentComponentErrorCode | undefined,
): string | undefined {
  if (outcome === "superseded") {
    return "Superseded by a newer request for the same component";
  }
  if (outcome !== "failed" || code === undefined) {
    return undefined;
  }
  return REJECTED_STAGE_LABELS[code] ?? humanize(code);
}
