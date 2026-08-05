"use client";

import { useState } from "react";
import { InfoIcon } from "lucide-react";
import { AgentComponentProvider } from "@nom-ai/sdk";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createAgentController } from "../lib/agent-controller";
import { AgentEventLog } from "./agent-event-log";
import { AgentScenarios } from "./agent-scenarios";
import { AgentDeliverySummary, AgentShipmentsTable } from "./agent-shipments";
import { DevtoolsMount } from "./devtools-mount";

/**
 * A lab for the devtools event stream and panel.
 *
 * One controller, two registered components, and a set of buttons that steer a request
 * into every terminal the pipeline can reach. No model and no API key: every scenario
 * drives `controller.execute` directly, which is the same path an AI adapter takes.
 */
export function AgentDevtoolsLab() {
  const [controller] = useState(() => createAgentController());
  const settings = controller.getDevtoolsSettings();

  return (
    <AgentComponentProvider controller={controller}>
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 pb-24 sm:p-6 sm:pb-24">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Devtools</p>
            <h1 className="text-2xl font-semibold tracking-tight">Pipeline lab</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={settings.enabled ? "secondary" : "outline"}>
              {settings.enabled ? "Devtools enabled" : "Devtools off"}
            </Badge>
            <Badge variant={settings.payloadMode === "verbatim" ? "destructive" : "outline"}>
              {settings.payloadMode} payloads
            </Badge>
            <Badge variant={settings.mockFire ? "destructive" : "outline"}>
              mock fire {settings.mockFire ? "on" : "off"}
            </Badge>
            <Badge variant="outline">history {settings.historyLimit}</Badge>
          </div>
        </header>

        {!settings.enabled && (
          <Alert>
            <InfoIcon />
            <AlertTitle>This build did not enable devtools</AlertTitle>
            <AlertDescription>
              Set <code>NEXT_PUBLIC_AGENT_DEVTOOLS=on</code> in <code>.env.local</code> and restart.
              The panel is not mounted and nothing is retained until you do; live subscribers still
              receive events.
            </AlertDescription>
          </Alert>
        )}

        <AgentScenarios controller={controller} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <AgentDeliverySummary />
          </div>
          <div className="sm:col-span-2">
            <AgentEventLog controller={controller} />
          </div>
        </div>

        <AgentShipmentsTable />

        <DevtoolsMount />
      </main>
    </AgentComponentProvider>
  );
}
