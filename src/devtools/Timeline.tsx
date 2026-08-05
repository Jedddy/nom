"use client";

import type { ReactNode } from "react";

import type { AgentDevtoolsSettings } from "../core/controller.js";
import { RequestDetail } from "./RequestDetail.js";
import type { AgentRequestEntry } from "./requests.js";
import { defineDevtoolsTab } from "./tabs.js";

/** Props for the chronological request timeline. */
export interface TimelineProps {
  /** One entry per request, in the order the requests started. */
  readonly requests: readonly AgentRequestEntry[];
  /** The controller's devtools capabilities, which decide the empty state and payload mode. */
  readonly settings: AgentDevtoolsSettings;
  /** The selected request, or `null` for the list-only view. */
  readonly selectedRequestId: string | null;
  /** Selects a request, or clears the selection with `null`. */
  readonly onSelectRequest: (requestId: string | null) => void;
}

/**
 * The default panel view, registered into the shell's tab list.
 *
 * Selection lives on the shell rather than here, so another view can point at the request
 * it just produced and have this list open on it.
 *
 * @see AgentDevtoolsTab for the registration contract other views follow.
 */
export const timelineTab = defineDevtoolsTab({
  id: "timeline",
  label: "Timeline",
  render: (context) => (
    <Timeline
      requests={context.requests}
      settings={context.settings}
      selectedRequestId={context.selectedRequestId}
      onSelectRequest={context.selectRequest}
    />
  ),
});

/**
 * Lists every recorded request across every mounted component, oldest first.
 *
 * Rows are a semantic list of buttons rather than a live region: the timeline updates
 * while a developer reads it, and announcing every stage of every request would make the
 * panel unusable with a screen reader.
 */
export function Timeline({
  requests,
  settings,
  selectedRequestId,
  onSelectRequest,
}: TimelineProps): ReactNode {
  if (!settings.enabled) {
    return (
      <p className="nom-empty">
        Devtools are not enabled on this controller, so no pipeline events are retained. Construct
        it with <code>new AgentComponentController({"{ devtools: {} }"})</code> to record them.
      </p>
    );
  }

  if (requests.length === 0) {
    return <p className="nom-empty">No tool requests have been recorded yet.</p>;
  }

  const selected = requests.find((request) => request.requestId === selectedRequestId) ?? null;

  return (
    <div className="nom-timeline">
      <ol className="nom-timeline-list" aria-label="Tool requests">
        {requests.map((request) => (
          <li key={request.requestId}>
            <button
              type="button"
              className="nom-row"
              aria-pressed={request.requestId === selectedRequestId}
              onClick={() => onSelectRequest(request.requestId)}
            >
              <span className="nom-row-title">
                {request.componentId} · {request.toolKey}
              </span>
              <span className={`nom-badge nom-badge-${request.outcome}`}>
                {request.outcomeLabel}
              </span>
              {request.showsPriorContent ? (
                <span className="nom-chip">Showing prior content</span>
              ) : null}
              <span className="nom-row-stages">
                {request.stages.map((stage, index) => (
                  <span
                    key={`${index}-${stage.type}`}
                    className="nom-stage"
                  >{`${stage.label} ${stage.elapsedMs} ms`}</span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {selected === null ? null : (
        <RequestDetail
          request={selected}
          payloadMode={settings.payloadMode}
          onClose={() => onSelectRequest(null)}
        />
      )}
    </div>
  );
}
