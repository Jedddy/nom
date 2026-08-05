# Devtools and the event stream

The controller reports every stage of every component tool request as a pipeline event. The stream is public API: a host can subscribe to it for its own logging or telemetry without mounting anything. The panel at `@nom-ai/sdk/devtools` is one consumer of that stream, not a privileged one.

## Enabling the stream

Devtools capabilities are constructor options on the controller, so the host that builds the controller decides what the channel carries. Mounting the panel never grants a capability that was not enabled here:

```ts
import { AgentComponentController } from "@nom-ai/sdk";

export const agentComponents = new AgentComponentController({
  devtools: {},
});
```

| Option             | Default      | Effect                                                                       |
| ------------------ | ------------ | ---------------------------------------------------------------------------- |
| `verbatimPayloads` | `false`      | Attaches raw input, output, and mapped props to events instead of summaries. |
| `mockFire`         | `false`      | Lets the panel apply developer-supplied output to a mounted component.       |
| `historyLimit`     | `200` events | Maximum retained events; the oldest are discarded past it.                   |

Passing `devtools` at all is what turns on retention. A controller constructed without the option retains nothing — `historyLimit` resolves to `0` — because an unconfigured controller in a production build must not accumulate events for a panel that will never read them.

Live delivery is separate from retention. `subscribeEvents` works on every controller, including one built with no `devtools` option, so a host telemetry integration does not have to enable devtools to receive events.

Read the resolved capabilities with `getDevtoolsSettings()`. The result is frozen and fixed for the controller's lifetime:

```ts
const settings = agentComponents.getDevtoolsSettings();
// { enabled: boolean; payloadMode: "structural" | "verbatim"; mockFire: boolean; historyLimit: number }
```

## Subscribing

`subscribeEvents` takes a listener and returns an unsubscribe function, mirroring `subscribeRegistry`:

```ts
import type { AgentPipelineEvent } from "@nom-ai/sdk";

const unsubscribe = agentComponents.subscribeEvents((event: AgentPipelineEvent) => {
  telemetry.record(event.type, {
    componentId: event.componentId,
    toolKey: event.toolKey,
    requestId: event.requestId,
    timestamp: event.timestamp,
  });
});
```

Every emission point catches and discards listener exceptions, so a throwing subscriber cannot change the outcome of a request. `onError` is unchanged and still fires for published failures; failure events are a strict superset of it, because aborted and superseded terminals emit an event without an `onError` call.

## Reading retained events

`getEvents()` returns the retained history, oldest first, as a frozen array whose identity changes only when a new event is recorded. That stability is what makes the array usable directly as a `useSyncExternalStore` snapshot:

```ts
const events = useSyncExternalStore(
  (onStoreChange) => agentComponents.subscribeEvents(onStoreChange),
  () => agentComponents.getEvents(),
  () => agentComponents.getEvents(),
);
```

Both halves are required. Subscribing without the accessor hands React a fresh array on every render and loops.

## Event shape

Every event carries `componentId`, `toolKey`, `requestId`, and a `timestamp` in milliseconds since the epoch. The `type` discriminant names the stage or outcome:

| `type`              | Carries                                    |
| ------------------- | ------------------------------------------ |
| `request-started`   | `supersededRequestId?`, `hasPreviousProps` |
| `input-validated`   | `input?`                                   |
| `authorized`        | —                                          |
| `executed`          | —                                          |
| `output-validated`  | `output?`                                  |
| `mapped`            | `props?`                                   |
| `request-succeeded` | `props?`                                   |
| `request-empty`     | —                                          |
| `request-failed`    | `code`, `issuePaths?`                      |

Terminal failure events carry the typed `AgentComponentErrorCode` and, for schema failures, the issue paths only. Error messages, cause chains, and schema issue message strings are withheld, because those strings routinely echo the values that failed.

### The type union is open

`AgentPipelineEventType` is an open union. Later minor releases may add stage and outcome names — `projection-failed` on the model-output path is already a foreseeable addition. Consumers must fall through unrecognized types rather than switching exhaustively:

```ts
function label(event: AgentPipelineEvent): string {
  switch (event.type) {
    case "request-failed":
      return `failed: ${event.code}`;
    case "request-succeeded":
      return "succeeded";
    default:
      // Required: a new variant must not break a consumer built against this release.
      return event.type;
  }
}
```

Widening the union is a minor-release change, not a breaking one. Code that exhausts the union will stop compiling on upgrade; code with a default branch will not.

## Payload modes

By default, payload fields carry an `AgentValueSummary` — a structural description of the value with key names, value types, and collection sizes, but no values. Traversal is capped by depth, key count, key length, array sample, and total node count. An object whose key count or key length exceeds its bound is reported as a keyed collection with its key count, key type, and value type, so data carried in keys does not escape. Values past the depth or node cap are reported by type alone, non-plain values by constructor name, and cycles are marked rather than followed. The structural path never throws, for any input.

`verbatimPayloads: true` replaces every summary with the host value unchanged. Read `getDevtoolsSettings().payloadMode` and narrow before treating a payload as a summary:

```ts
import type { AgentValueSummary } from "@nom-ai/sdk";

const mode = agentComponents.getDevtoolsSettings().payloadMode;

agentComponents.subscribeEvents((event) => {
  if (event.type !== "output-validated" || event.output === undefined) {
    return;
  }
  if (mode === "structural") {
    const summary = event.output as AgentValueSummary;
    console.log(summary.kind);
  }
});
```

Payload fields are absent entirely when the controller has nobody to describe them for — no `devtools` option and no subscriber. The summarizer walk is skipped rather than discarded, so an unconfigured controller pays nothing for the stream.

## The panel

The panel ships from its own package entry. An application that never imports `@nom-ai/sdk/devtools` carries none of its code or styles; the root entry does not re-export it.

Mount it once anywhere inside `AgentComponentProvider`. It discovers every registered component through the controller it resolves from context, with no per-component wiring:

```tsx
"use client";

import { AgentDevtools } from "@nom-ai/sdk/devtools";

export function DevtoolsMount() {
  return <AgentDevtools />;
}
```

```tsx
<AgentComponentProvider controller={agentComponents}>
  <App />
  <DevtoolsMount />
</AgentComponentProvider>
```

The panel is a collapsed launcher that opens a bottom-docked drawer with three built-in views: Timeline, Manifest, and Mock fire. It renders into a shadow root on a document-level container, so it neither ships a stylesheet nor inherits host styles, and it renders nothing at all during server rendering. `Escape` collapses it.

Add a view of your own with the `additionalTabs` prop. Host tabs are appended after the built-ins and receive the same context the built-ins do — the controller, its settings, the events, the events grouped per request, and the current selection:

```tsx
import { AgentDevtools, defineDevtoolsTab } from "@nom-ai/sdk/devtools";

const countsTab = defineDevtoolsTab({
  id: "counts",
  label: "Counts",
  render: ({ requests }) => <p>{requests.length} requests recorded</p>,
});

<AgentDevtools additionalTabs={[countsTab]} />;
```

A tab must not subscribe to the controller again. The shell owns the single subscription and the single grouping pass over it.

## Mock fire

Mock fire is the only devtools capability that writes. It has its own opt-in, separate from the payload switch, because read sensitivity and write capability are different risks:

```ts
const agentComponents = new AgentComponentController({
  devtools: { mockFire: true },
});
```

With it off, the tab is never built — the panel offers no control to apply an output, not an inert one. With it on, the entered JSON goes to `controller.applyOutput`, the same path an external executor uses, so output validation, developer mapping, and the published snapshot are identical to a real call. An output the tool's output schema refuses puts the component into its failure state exactly as a real call with that payload would, and the timeline reports where it was rejected.

## What a host accepts

Four things to settle before this ships in a build anyone else can open.

**Mock fire is development-only.** With it enabled, anyone who can open the panel in a deployed build can write arbitrary schema-valid output into any registered component. The SDK cannot key the default on your environment: `scripts/build.ts` defines `process.env.NODE_ENV` as `production` at SDK build time, so the packed SDK has no view of the consuming application's mode. Host discipline is the only control — gate the option on your own environment flag.

**The verbatim switch is controller-wide.** It reaches every subscriber on that controller, including any host telemetry or logging integration attached to it. Enabling it to debug one component ships raw input, output, and mapped props everywhere the stream goes.

**The manifest view discloses the model-facing surface.** Component instructions, tool descriptions, generated input schemas, and approval flags are visible to anyone who can open the panel. That is disclosure the host accepts by mounting the panel, not something the default configuration withholds.

**Verbatim mode is a construction-time option.** It cannot be toggled from the panel. Turning it on takes a code change, an application restart, and a reproduction of the request before any value appears — which is the point: mounting the panel is never itself the grant.

Render-facing behavior is unchanged by any of this. Component snapshots still receive the typed code and a safe message; the stream is a separate, host-facing channel.

## Example

[`examples/devtools`](https://github.com/Jedddy/nom/tree/main/examples/devtools) is a copy-ready lab that drives a request into every terminal the pipeline can reach — success, empty, a refused output schema, a throwing mapper, a rejected input, a superseded request, a refetch over prior content, and an authorization denial — with no model and no API key. It also covers the surrounding surface: a host event log built on `subscribeEvents` and `getEvents`, a telemetry sink that works with devtools off, custom tabs through `additionalTabs`, and the environment gating that keeps the panel out of a build that did not ask for it.
