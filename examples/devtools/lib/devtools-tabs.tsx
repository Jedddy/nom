"use client";

import { useState } from "react";
import {
  type AgentDevtoolsTabContext,
  type AgentRequestEntry,
  defineDevtoolsTab,
} from "@nom-ai/sdk/devtools";

/**
 * Host-registered panel views, passed to `<AgentDevtools additionalTabs={...} />`.
 *
 * Two things to know before writing one:
 *
 * 1. A tab renders inside the panel's shadow root, so Tailwind and shadcn classes from the
 *    host application do not reach it. Use the panel's own class names, as below, or
 *    inline styles.
 * 2. A tab must not subscribe to the controller's event stream again. The shell owns the
 *    single subscription and the single grouping pass; everything a tab needs is already
 *    resolved on the context it receives.
 */

/** Per-component outcome tally, derived from the requests the shell already grouped. */
const healthTab = defineDevtoolsTab({
  id: "health",
  label: "Health",
  render: ({ requests }) => <HealthView requests={requests} />,
});

/** Copies the timeline as JSON, for pasting into a bug report. */
const exportTab = defineDevtoolsTab({
  id: "export",
  label: "Export",
  render: (context) => <ExportView {...context} />,
});

export const labDevtoolsTabs = [healthTab, exportTab];

interface ComponentHealth {
  componentId: string;
  total: number;
  succeeded: number;
  empty: number;
  failed: number;
  superseded: number;
  slowestMs: number;
}

function HealthView({ requests }: { readonly requests: readonly AgentRequestEntry[] }) {
  if (requests.length === 0) {
    return <p className="nom-empty">Nothing has been recorded yet.</p>;
  }

  const byComponent = new Map<string, ComponentHealth>();
  for (const request of requests) {
    const health = byComponent.get(request.componentId) ?? {
      componentId: request.componentId,
      total: 0,
      succeeded: 0,
      empty: 0,
      failed: 0,
      superseded: 0,
      slowestMs: 0,
    };
    byComponent.set(request.componentId, health);

    health.total += 1;
    health.slowestMs = Math.max(health.slowestMs, request.totalElapsedMs);
    if (request.outcome === "succeeded") health.succeeded += 1;
    if (request.outcome === "empty") health.empty += 1;
    if (request.outcome === "failed") health.failed += 1;
    if (request.outcome === "superseded") health.superseded += 1;
  }

  return (
    <div className="nom-manifest-list">
      {[...byComponent.values()].map((health) => (
        <section key={health.componentId} className="nom-manifest-component">
          <h3 className="nom-manifest-id">{health.componentId}</h3>
          <dl className="nom-detail-meta">
            <dt>Requests</dt>
            <dd>{health.total}</dd>
            <dt>Succeeded</dt>
            <dd>{health.succeeded}</dd>
            <dt>Empty</dt>
            <dd>{health.empty}</dd>
            <dt>Failed</dt>
            <dd>{health.failed}</dd>
            <dt>Superseded</dt>
            <dd>{health.superseded}</dd>
            <dt>Slowest</dt>
            <dd>{health.slowestMs} ms</dd>
          </dl>
        </section>
      ))}
    </div>
  );
}

function ExportView({ requests, settings }: AgentDevtoolsTabContext) {
  const [copied, setCopied] = useState(false);

  // Identity, stages, and outcomes only. Payloads are left out on purpose: under
  // `verbatimPayloads` they carry raw application data, and a bug report is exactly the
  // place that data should not travel to.
  const report = JSON.stringify(
    {
      payloadMode: settings.payloadMode,
      requests: requests.map((request) => ({
        requestId: request.requestId,
        componentId: request.componentId,
        toolKey: request.toolKey,
        outcome: request.outcome,
        failureCode: request.failureCode,
        supersededRequestId: request.supersededRequestId,
        showsPriorContent: request.showsPriorContent,
        totalElapsedMs: request.totalElapsedMs,
        stages: request.stages.map((stage) => ({ type: stage.type, elapsedMs: stage.elapsedMs })),
      })),
    },
    null,
    2,
  );

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="nom-mock">
      <p className="nom-muted">
        {requests.length} requests, identity and timing only. Payload values are never included.
      </p>
      <div className="nom-mock-actions">
        <button type="button" className="nom-mock-apply" onClick={() => void copyReport()}>
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
      <pre className="nom-payload">{report}</pre>
    </div>
  );
}
