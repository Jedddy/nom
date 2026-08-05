"use client";

import type { ReactNode } from "react";

import type { AgentPipelineIssuePath } from "../core/events.js";
import type { AgentPayloadMode } from "../core/summarize.js";
import { describeIssuePath, describePayload } from "./payload.js";
import type { AgentRequestEntry } from "./requests.js";

/** Props for the per-request detail view opened from a timeline row. */
export interface RequestDetailProps {
  /** The selected request, already grouped from its events. */
  readonly request: AgentRequestEntry;
  /** The controller's payload mode, which decides how payloads are rendered. */
  readonly payloadMode: AgentPayloadMode;
  /** Clears the selection and returns the timeline to the list-only view. */
  readonly onClose: () => void;
}

/**
 * Shows every stage one request reached, with elapsed time, outcome, and its payloads.
 *
 * Payloads are rendered exactly as the controller recorded them: structural summaries by
 * default and raw values only when the host enabled verbatim mode, so an absent value here
 * always means the pipeline never produced one rather than that the panel dropped it.
 */
export function RequestDetail({ request, payloadMode, onClose }: RequestDetailProps): ReactNode {
  return (
    <section
      className="nom-detail"
      aria-label={`Request detail: ${request.componentId} ${request.toolKey}`}
    >
      <div className="nom-detail-header">
        <h3 className="nom-detail-title">
          {request.componentId} · {request.toolKey}
        </h3>
        <button type="button" className="nom-detail-close" onClick={onClose}>
          Close request detail
        </button>
      </div>

      <dl className="nom-detail-meta">
        <dt>Request id</dt>
        <dd>{request.requestId}</dd>
        <dt>Outcome</dt>
        <dd>{request.outcomeLabel}</dd>
        {request.rejectedStageLabel === undefined ? null : (
          <>
            <dt>Rejected at</dt>
            <dd>{request.rejectedStageLabel}</dd>
          </>
        )}
        {request.showsPriorContent ? (
          <>
            <dt>Loading state</dt>
            <dd>Showing prior content from the last success</dd>
          </>
        ) : null}
        <dt>Total elapsed</dt>
        <dd>{`${request.totalElapsedMs} ms`}</dd>
      </dl>

      <h4 className="nom-section-title">Stages reached</h4>
      <ol className="nom-detail-stages">
        {request.stages.map((stage, index) => (
          <li key={`${index}-${stage.type}`}>{`${stage.label} ${stage.elapsedMs} ms`}</li>
        ))}
      </ol>

      <PayloadSection
        title="Input"
        present={request.hasInput}
        value={request.input}
        mode={payloadMode}
      />
      <PayloadSection
        title="Output"
        present={request.hasOutput}
        value={request.output}
        mode={payloadMode}
        rejection={
          request.failureCode === "invalid-output" ? { paths: request.issuePaths } : undefined
        }
      />
      <PayloadSection
        title="Mapped props"
        present={request.hasProps}
        value={request.props}
        mode={payloadMode}
      />
    </section>
  );
}

interface PayloadRejection {
  /** Paths the rejecting schema reported, absent when it reported none. */
  readonly paths: readonly AgentPipelineIssuePath[] | undefined;
}

interface PayloadSectionProps {
  readonly title: string;
  readonly present: boolean;
  readonly value: unknown;
  readonly mode: AgentPayloadMode;
  /**
   * Present when this payload was rejected rather than never produced.
   *
   * The rejected value itself is never available — R19 keeps it out of the event — so the
   * section reports the paths the schema named instead of showing nothing at all.
   */
  readonly rejection?: PayloadRejection | undefined;
}

function PayloadSection({
  title,
  present,
  value,
  mode,
  rejection,
}: PayloadSectionProps): ReactNode {
  return (
    <>
      <h4 className="nom-section-title">{title}</h4>
      {present ? (
        <pre className="nom-payload">{describePayload(value, mode)}</pre>
      ) : rejection === undefined ? (
        <p className="nom-muted">Not recorded for this request.</p>
      ) : (
        <p className="nom-muted">
          {rejection.paths === undefined || rejection.paths.length === 0
            ? "Rejected by the output schema, which reported no paths."
            : `Rejected by the output schema at ${rejection.paths.map(describeIssuePath).join(", ")}.`}
        </p>
      )}
    </>
  );
}
