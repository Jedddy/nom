"use client";

import { useState } from "react";
import type { AgentComponentController, AgentComponentExecutionRequest } from "@nom-ai/sdk";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  DELIVERY_SUMMARY_COMPONENT_ID,
  SHIPMENTS_COMPONENT_ID,
  loadArchivedShipments,
  loadDeliverySummary,
  loadShipments,
} from "../lib/agent-tools";
import { type AgentFault, setAgentFault, setHostApproval } from "../lib/lab-controls";

interface Scenario {
  readonly id: string;
  readonly label: string;
  /** What the timeline should show once the scenario finishes. */
  readonly expectation: string;
  readonly run: (controller: AgentComponentController) => Promise<void>;
}

const loadAll = {
  componentId: SHIPMENTS_COMPONENT_ID,
  toolKey: loadShipments.key,
  input: { status: "all" },
} satisfies AgentComponentExecutionRequest;

const outcomeScenarios: readonly Scenario[] = [
  {
    id: "success",
    label: "Load shipments",
    expectation:
      "start, input validated, authorized, executed, output validated, mapped, succeeded",
    run: (controller) => fire(controller, "none", loadAll),
  },
  {
    id: "empty",
    label: "Map to empty",
    expectation: "an empty terminal — the data source answered, the mapper chose no data",
    run: (controller) => fire(controller, "empty", loadAll),
  },
  {
    id: "invalid-output",
    label: "Break the output shape",
    expectation: "rejected at output validation, with the issue paths and no rejected values",
    run: (controller) => fire(controller, "invalid-output", loadAll),
  },
  {
    id: "execution-failure",
    label: "Fail the data source",
    expectation: "no output-validated stage; the request ends at execution-failed",
    run: (controller) => fire(controller, "execution-failure", loadAll),
  },
  {
    id: "mapping-failure",
    label: "Throw in the mapper",
    expectation: "output validated, then mapping-failed — the same empty screen, a different cause",
    run: (controller) => fire(controller, "mapping-failure", loadAll),
  },
  {
    id: "invalid-input",
    label: "Send invalid input",
    expectation: "rejected at input validation; execution never runs",
    run: (controller) =>
      fire(controller, "none", {
        ...loadAll,
        // Deliberately off-schema: this is what an unhelpful tool description produces.
        input: { status: "sideways" },
      }),
  },
];

const pipelineScenarios: readonly Scenario[] = [
  {
    id: "supersede",
    label: "Supersede an in-flight request",
    expectation: "the second request names the first; the first ends as superseded, not failed",
    run: async (controller) => {
      setAgentFault("slow");
      const slow = safeExecute(controller, loadAll);
      await delay(150);
      setAgentFault("none");
      await safeExecute(controller, loadAll);
      await slow;
    },
  },
  {
    id: "refetch",
    label: "Refetch over prior content",
    expectation: "the second request is flagged as carrying previous props",
    run: async (controller) => {
      await fire(controller, "none", loadAll);
      await fire(controller, "slow", loadAll);
    },
  },
  {
    id: "two-components",
    label: "Load both components",
    expectation: "one timeline spanning two component ids",
    run: async (controller) => {
      setAgentFault("none");
      await Promise.all([
        safeExecute(controller, loadAll),
        safeExecute(controller, {
          componentId: DELIVERY_SUMMARY_COMPONENT_ID,
          toolKey: loadDeliverySummary.key,
          input: { window: "week" },
        }),
      ]);
    },
  },
  {
    id: "archived",
    label: "Call the approval-gated tool",
    expectation: "authorized, or an authorization-denied terminal while approval is withheld",
    run: (controller) =>
      fire(controller, "none", {
        componentId: SHIPMENTS_COMPONENT_ID,
        toolKey: loadArchivedShipments.key,
        input: { since: "quarter" },
      }),
  },
];

/** Drives the controller directly, so every scenario runs without a model or an API key. */
export function AgentScenarios({ controller }: { readonly controller: AgentComponentController }) {
  const [runningId, setRunningId] = useState<string>();
  const [lastRun, setLastRun] = useState<Scenario>();
  const [approvalGranted, setApprovalGranted] = useState(false);

  async function runScenario(scenario: Scenario) {
    setRunningId(scenario.id);
    setLastRun(scenario);
    try {
      await scenario.run(controller);
    } finally {
      setRunningId(undefined);
    }
  }

  function renderGroup(title: string, scenarios: readonly Scenario[]) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="flex flex-wrap gap-2">
          {scenarios.map((scenario) => (
            <Button
              key={scenario.id}
              variant="outline"
              size="sm"
              disabled={runningId !== undefined}
              onClick={() => void runScenario(scenario)}
            >
              {scenario.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenarios</CardTitle>
        <CardDescription>
          Each button drives the controller directly. Open the panel and watch the timeline explain
          what the component alone cannot.
        </CardDescription>
        <CardAction>
          <Field orientation="horizontal">
            <Switch
              id="host-approval"
              checked={approvalGranted}
              onCheckedChange={(checked: boolean) => {
                setApprovalGranted(checked);
                setHostApproval(checked);
              }}
            />
            <FieldLabel htmlFor="host-approval">Grant approval</FieldLabel>
          </Field>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {renderGroup("Outcomes", outcomeScenarios)}
        <Separator />
        {renderGroup("Concurrency and policy", pipelineScenarios)}
        {lastRun && (
          <Field>
            <FieldDescription>
              <span className="font-medium text-foreground">{lastRun.label}:</span> expect{" "}
              {lastRun.expectation}.
            </FieldDescription>
          </Field>
        )}
      </CardContent>
    </Card>
  );
}

function fire(
  controller: AgentComponentController,
  fault: AgentFault,
  request: AgentComponentExecutionRequest,
): Promise<void> {
  setAgentFault(fault);
  return safeExecute(controller, request);
}

/**
 * Runs a request and swallows its rejection.
 *
 * `execute` rejects on every failing outcome, which a real caller handles. Here the whole
 * point is the failure, and the timeline is the report — so the rejection is expected and
 * an unhandled one would just add console noise on top of the `onError` line.
 */
async function safeExecute(
  controller: AgentComponentController,
  request: AgentComponentExecutionRequest,
): Promise<void> {
  try {
    await controller.execute(request);
  } catch {
    // Reported by the event stream, the panel, and `onError`.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
