# Devtools example

A compact Next.js App Router example for the pipeline event stream and the `<AgentDevtools />` panel. Copy these files into an existing application; this directory is not a standalone app.

It needs no model and no API key. Every scenario calls `controller.execute` directly — the same path an AI adapter takes — so a request reaches each terminal the pipeline can produce on demand.

## Install

```bash
npm install @nom-ai/sdk lucide-react zod
npx shadcn@latest add alert badge button card empty field separator skeleton spinner switch table
```

Copy:

- `components/agent-devtools-lab.tsx`
- `components/agent-scenarios.tsx`
- `components/agent-shipments.tsx`
- `components/agent-event-log.tsx`
- `components/devtools-mount.tsx`
- `components/devtools-panel.tsx`
- `lib/agent-contracts.ts`
- `lib/agent-controller.ts`
- `lib/agent-tools.ts`
- `lib/agent-telemetry.ts`
- `lib/lab-controls.ts`
- `lib/devtools-tabs.tsx`
- `app/api/shipments/route.ts`
- `app/api/delivery-summary/route.ts`

Add to `.env.local`:

```bash
NEXT_PUBLIC_AGENT_DEVTOOLS=on
# Optional. Attaches raw values to events instead of structural summaries.
NEXT_PUBLIC_AGENT_DEVTOOLS_PAYLOADS=verbatim
```

Render the lab from a page:

```tsx
import { AgentDevtoolsLab } from "@/components/agent-devtools-lab";

export default function Page() {
  return <AgentDevtoolsLab />;
}
```

## What the scenarios show

Open the panel with the launcher in the bottom-right corner, then run a scenario and read the timeline.

| Scenario                       | What the timeline reports                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Load shipments                 | Every stage in order, ending in a success terminal                                        |
| Map to empty                   | An empty terminal — the source answered and the mapper chose no data                      |
| Break the output shape         | Rejected at output validation, with issue paths and no rejected values                    |
| Fail the data source           | No output-validated stage; the request ends at `execution-failed`                         |
| Throw in the mapper            | Output validated, then `mapping-failed` — the same blank screen, a different cause        |
| Send invalid input             | Rejected at input validation; execution never runs                                        |
| Supersede an in-flight request | The second request names the first; the first ends as superseded, not failed              |
| Refetch over prior content     | The second request is flagged as carrying previous props, so prior content is not "stale" |
| Load both components           | One timeline spanning two component ids                                                   |
| Call the approval-gated tool   | `authorization-denied`, or an authorized run once the switch grants approval              |

The three failures — a refused output schema, a throwing mapper, and a mapper that returned empty — are indistinguishable at the render boundary by design. Separating them without adding logging is what the panel is for.

## Extras in this example

**A host event log** (`components/agent-event-log.tsx`). The stream is public API, not a private channel for the panel. This card reads it with `subscribeEvents` plus `getEvents` in `useSyncExternalStore` — both halves are required, because the accessor is what supplies React a referentially stable snapshot.

**A telemetry sink** (`lib/agent-telemetry.ts`). A tally built on the subscription alone, which works on a controller constructed with no `devtools` option: live delivery does not depend on that option, only retention does. It reads identity fields and typed codes and never touches a payload, so it stays safe if someone enables `verbatimPayloads` to debug something else.

**Custom panel tabs** (`lib/devtools-tabs.tsx`). `additionalTabs` adds host views next to Timeline, Manifest, and Mock fire — here a per-component health tally and a JSON export for bug reports. Two constraints worth knowing: a tab renders inside the panel's shadow root, so host Tailwind and shadcn classes do not reach it, and a tab must never subscribe to the stream again — the shell owns the single subscription and hands each tab what it already resolved.

**Two independent gates** (`components/devtools-mount.tsx`, `lib/agent-controller.ts`). The environment flag decides whether the panel's chunk is ever requested; `next/dynamic` keeps the only `@nom-ai/sdk/devtools` import behind it. The controller's constructor options decide what the panel may see and do. Mounting the panel grants nothing by itself.

**Host-injected faults** (`lib/lab-controls.ts`). The fault knob is module state read by the executor and the mapper, never a field on the input schema. A model must not be able to ask for a broken response.

## Before this ships anywhere shared

`mockFire` is on in this example, because a lab is exactly where writing arbitrary schema-valid output into a live component is useful. In a deployed build, anyone who can open the panel can do the same. The SDK cannot key that default on your environment — it is built with `NODE_ENV` fixed to `production` — so gating it, as `lib/agent-controller.ts` does, is host discipline.

`verbatimPayloads` is controller-wide and construction-time. It reaches every subscriber, including the telemetry sink. The manifest view discloses instructions, tool descriptions, generated input schemas, and approval flags to anyone who can open the panel.

See [`docs/devtools.md`](../../docs/devtools.md) for the full contract.
