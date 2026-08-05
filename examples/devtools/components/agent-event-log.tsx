"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AgentComponentController, AgentPipelineEvent } from "@nom-ai/sdk";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type AgentTelemetrySnapshot, attachAgentTelemetry } from "../lib/agent-telemetry";

const NO_EVENTS: readonly AgentPipelineEvent[] = Object.freeze([]);
const VISIBLE_EVENTS = 12;

/**
 * A host-owned view of the same stream the panel reads, built without importing the panel.
 *
 * Two independent halves of the public API are on display here:
 *
 * - `subscribeEvents` plus `getEvents` in `useSyncExternalStore`. Both are required: the
 *   subscription reports that something changed, and the accessor returns a frozen array
 *   whose identity only changes when an event is recorded, which is the stable snapshot
 *   React compares. Subscribing without the accessor hands React a fresh array every
 *   render and loops.
 * - `attachAgentTelemetry`, which uses the subscription alone. That path works on any
 *   controller, including one built with no `devtools` option; retention is what the
 *   option turns on.
 */
export function AgentEventLog({ controller }: { readonly controller: AgentComponentController }) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => controller.subscribeEvents(onStoreChange),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getEvents(), [controller]);
  const events = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [telemetry, setTelemetry] = useState<AgentTelemetrySnapshot>();
  useEffect(() => attachAgentTelemetry(controller, setTelemetry), [controller]);

  const settings = controller.getDevtoolsSettings();
  const recent = events.slice(-VISIBLE_EVENTS).reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Host event log</CardTitle>
        <CardDescription>
          The stream is public API. This card reads it directly — no panel involved.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{events.length} retained</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {telemetry && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{telemetry.requestsStarted} started</Badge>
            <Badge variant="secondary">{telemetry.succeeded} succeeded</Badge>
            <Badge variant="secondary">{telemetry.empty} empty</Badge>
            <Badge variant="secondary">{telemetry.superseded} superseded</Badge>
            {Object.entries(telemetry.failuresByCode).map(([code, count]) => (
              <Badge key={code} variant="destructive">
                {count} {code}
              </Badge>
            ))}
            <Badge variant="outline">slowest {telemetry.slowestRequestMs} ms</Badge>
          </div>
        )}

        {settings.historyLimit === 0 ? (
          <Alert>
            <AlertTitle>Retention is off in this build</AlertTitle>
            <AlertDescription>
              The controller was constructed without a <code>devtools</code> option, so
              <code> getEvents()</code> stays empty. The tally above still updates, because live
              delivery does not depend on that option.
            </AlertDescription>
          </Alert>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded yet. Run a scenario above.
          </p>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-xs">
            {recent.map((event, index) => (
              <li
                key={`${event.requestId}-${event.type}-${index}`}
                className="flex flex-wrap items-center gap-2"
              >
                <Badge variant={toneFor(event)}>{event.type}</Badge>
                <span>
                  {event.componentId}.{event.toolKey}
                </span>
                <span className="text-muted-foreground">#{event.requestId.slice(-6)}</span>
                <span className="ml-auto text-muted-foreground">{describeDetail(event)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function getServerSnapshot(): readonly AgentPipelineEvent[] {
  return NO_EVENTS;
}

function toneFor(event: AgentPipelineEvent): "default" | "secondary" | "destructive" | "outline" {
  switch (event.type) {
    case "request-failed":
      // `aborted` is a request that a newer one replaced, not a defect.
      return event.code === "aborted" ? "outline" : "destructive";
    case "request-succeeded":
      return "default";
    case "request-empty":
      return "secondary";
    default:
      // Required: `AgentPipelineEventType` is an open union, so an unrecognized stage from
      // a later release has to render rather than disappear.
      return "outline";
  }
}

/**
 * Describes one event without reaching into payload values.
 *
 * Payload fields carry a structural summary by default and raw host values under
 * `verbatimPayloads`, so anything that renders them has to narrow first. This log stays on
 * identity and typed codes, which read the same under either mode.
 */
function describeDetail(event: AgentPipelineEvent): string {
  switch (event.type) {
    case "request-started":
      return event.supersededRequestId
        ? `supersedes #${event.supersededRequestId.slice(-6)}`
        : event.hasPreviousProps
          ? "over prior content"
          : "";
    case "request-failed":
      return event.issuePaths?.length
        ? `${event.code} at ${event.issuePaths.map((path) => path.join(".") || "(root)").join(", ")}`
        : event.code;
    default:
      return "";
  }
}
