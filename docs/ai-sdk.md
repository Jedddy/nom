# AI SDK 6 integration

The adapter uses AI SDK 6 Core types and does not import `@ai-sdk/react` at runtime. The UI callback shapes are compile-tested against `@ai-sdk/react` 3.x.

## Same runtime

When the controller and model tools run in one JavaScript runtime, create tools directly from the active controller:

```ts
import { createAISDKTools } from "nom/ai-sdk";

const adapter = createAISDKTools(controller);
const result = streamText({ model, tools: adapter.tools, prompt });
```

The generated names are deterministic, provider-safe encodings of component/tool addresses. Execution delegates to `controller.execute`, so model input is validated, host authorization is re-run, component loading is published, output is validated, and mapped props reach only the target instance.

Tool results sent back to the model default to a fixed acknowledgement. Add `projectModelOutput` to a tool only when the model genuinely needs a deliberately selected subset of the result.

## Default tools

Pass ordinary AI SDK tools through `defaultTools` when the model needs host context or operations that do not target a component:

```ts
import { stepCountIs, tool } from "ai";
import { z } from "zod";

const getCurrentDate = tool({
  description:
    "Call this when a request uses relative dates or omits the year. Returns the current UTC date.",
  inputSchema: z.object({}),
  execute: () => ({ date: new Date().toISOString().slice(0, 10) }),
});

const adapter = createAISDKTools(controller, {
  defaultTools: { get_current_date: getCurrentDate },
});

const result = await generateText({
  model,
  prompt,
  tools: adapter.tools,
  stopWhen: stepCountIs(5),
});
```

Default tools are included in `adapter.tools` but excluded from `adapter.routing`, so they are never forwarded to a component. Every default tool must include a non-empty model-facing description explaining when the model should call it; adapter creation rejects undocumented tools. Generated component names are reserved, and a conflicting default tool name is rejected instead of overwritten.

AI SDK needs multiple steps when a default tool must execute before the model selects component tools. A default tool supplies context only. Each target component's input schema must still represent the requested value.

## Server model, browser components

The browser sends an address-only active manifest:

```ts
import { toActiveAgentManifest } from "nom/ai-sdk";

const activeManifest = toActiveAgentManifest(controller.getManifest());
```

Treat that value as untrusted routing input on the server. Resolve every address through a server-owned catalog:

```ts
import { createAISDKServerTools } from "nom/ai-sdk";

const adapter = createAISDKServerTools(activeManifest, {
  defaultTools: { get_current_date: getCurrentDate },
  expectedManifestVersion: session.activeManifestVersion,
  resolve: ({ componentId, toolKey }) => serverCatalog.get(componentId, toolKey),
  authorize: ({ address, input, approval }) =>
    approval === "never" || authorizeRequest({ address, input }),
});
```

The resolver supplies the canonical description, Standard Schema input, approval rule, optional server executor, and optional model-output projection. Unknown addresses are rejected before a model tool is created. Capability counts, address lengths, description lengths, and schema sizes are bounded.

## Selecting components

The adapter exposes mounted component tools but does not choose the number of targets. A model response may contain no routed component calls, one call, or calls for several components. Prompt the model according to your product behavior—for example, `Call every component tool needed to satisfy the complete request` when multi-component updates are allowed.

Selection remains model-directed. Returning one valid call does not prove that every part of the user's request was represented. Validate the selected targets or add a planning step when completeness must be deterministic.

Collect component calls across every model step and keep only names present in component routing:

```ts
const componentCalls = result.steps
  .flatMap((step) => step.toolCalls)
  .filter(({ toolName }) => adapter.routing.has(toolName));
```

Forward every collected call to the client. Each target publishes its own loading and terminal state; multiple component updates are independent rather than atomic.

When the resolver omits `execute`, AI SDK forwards the dynamic tool call to the UI. Create one bridge per chat:

```ts
const bridge = new AISDKClientBridge({
  chatId,
  controller,
  routing: createAIToolRouting(activeManifest),
});

const { addToolOutput } = useChat({
  onToolCall: ({ toolCall }) => bridge.handleToolCall(toolCall, (output) => addToolOutput(output)),
});
```

The callback returns only `{ status: "applied" }`; it does not serialize component data into conversation history. Use `bridge.applyToolPart(part)` when rendering dynamic tool parts from streamed messages. Input and approval events publish loading, server output is revalidated and mapped locally, and denied/error events become redacted failures.

Keep the same server tool set available when converting UI messages back to model messages so AI SDK can apply the server-owned `toModelOutput` projection.

## Replay and errors

The bridge keys calls by chat and AI SDK tool-call identity. Exact replay returns the original execution promise or becomes a no-op. Changed input, changed event payload, or conflicting terminal states fail with `adapter-failed`. Tracking is bounded; create a new bridge when the host changes chats.

Raw server `errorText` is available only as an error cause through the host callback. Component snapshots receive the typed code and a safe message.
