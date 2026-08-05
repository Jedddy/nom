import type { AgentComponentController, AgentPipelineEvent } from "@nom-ai/sdk";

/** A rolling tally of everything the pipeline has reported since the sink attached. */
export interface AgentTelemetrySnapshot {
  readonly events: number;
  readonly requestsStarted: number;
  readonly succeeded: number;
  readonly empty: number;
  readonly superseded: number;
  /** Failure counts keyed by `AgentComponentErrorCode`, excluding superseded aborts. */
  readonly failuresByCode: Readonly<Record<string, number>>;
  /** Longest observed start-to-terminal duration, in milliseconds. */
  readonly slowestRequestMs: number;
}

/** Receives a new tally after every event. */
export type AgentTelemetryListener = (snapshot: AgentTelemetrySnapshot) => void;

/** Bounds the in-flight map so a request whose terminal never arrives cannot leak. */
const MAX_TRACKED_REQUESTS = 500;

/**
 * Routes pipeline events into a host-owned tally, with no panel involved.
 *
 * This is the other half of the event stream: `subscribeEvents` works on every controller,
 * including one constructed without a `devtools` option, so a logging or telemetry
 * integration does not have to enable devtools to receive events. Only retention —
 * `getEvents()` — depends on that option.
 *
 * Nothing here reads an event payload. That keeps the sink safe under either payload mode:
 * `verbatimPayloads` is controller-wide, so a sink that logged `event.input` would start
 * shipping raw application data the moment somebody flipped the switch to debug something
 * else. Identity fields and typed codes are enough for a tally.
 */
export function attachAgentTelemetry(
  controller: AgentComponentController,
  onSnapshot: AgentTelemetryListener,
): () => void {
  const startedAt = new Map<string, number>();
  const failuresByCode: Record<string, number> = {};
  let events = 0;
  let requestsStarted = 0;
  let succeeded = 0;
  let empty = 0;
  let superseded = 0;
  let slowestRequestMs = 0;

  function finish(event: AgentPipelineEvent): void {
    const start = startedAt.get(event.requestId);
    if (start === undefined) return;

    startedAt.delete(event.requestId);
    slowestRequestMs = Math.max(slowestRequestMs, event.timestamp - start);
  }

  return controller.subscribeEvents((event) => {
    events += 1;

    switch (event.type) {
      case "request-started": {
        requestsStarted += 1;
        startedAt.set(event.requestId, event.timestamp);
        if (startedAt.size > MAX_TRACKED_REQUESTS) {
          const oldest = startedAt.keys().next();
          if (!oldest.done) startedAt.delete(oldest.value);
        }
        break;
      }
      case "request-succeeded": {
        succeeded += 1;
        finish(event);
        break;
      }
      case "request-empty": {
        empty += 1;
        finish(event);
        break;
      }
      case "request-failed": {
        // An `aborted` terminal is a request a newer one replaced, not a defect. It is the
        // one terminal that never reaches `onError`, which is why a tally built on
        // `onError` alone under-reports what the pipeline actually did.
        if (event.code === "aborted") {
          superseded += 1;
        } else {
          failuresByCode[event.code] = (failuresByCode[event.code] ?? 0) + 1;
        }
        finish(event);
        break;
      }
      default:
        // Required. `AgentPipelineEventType` is an open union: a stage added in a later
        // minor release must fall through here instead of breaking this consumer.
        break;
    }

    onSnapshot({
      events,
      requestsStarted,
      succeeded,
      empty,
      superseded,
      failuresByCode: { ...failuresByCode },
      slowestRequestMs,
    });
  });
}
