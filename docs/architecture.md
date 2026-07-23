# Architecture

`nom` has three layers with one-way dependencies:

1. `@nom-ai/sdk/core` owns schemas, registration, manifests, execution, authorization, lifecycle, and concurrency. It imports neither React nor AI SDK.
2. `@nom-ai/sdk/react` registers components in effects and subscribes to per-instance snapshots with `useSyncExternalStore`.
3. `@nom-ai/sdk/ai-sdk` translates active addresses and lifecycle events to AI SDK 6. It is the only entry that imports `ai` at runtime.

Host-owned default tools also live at the AI SDK boundary. They are merged into the model tool set but excluded from component routing, manifests, lifecycle state, and browser forwarding.

## Selection scope

An active manifest advertises mounted component capabilities; it does not prescribe how many must run. The host and model may select no component tool, one tool, or tools belonging to several component instances for a single user request. `nom` routes and validates the calls it receives but does not infer whether those calls completely represent the user's intent.

Each selected component call has an independent lifecycle. A host can execute multiple calls sequentially or concurrently, but `nom` does not make them an atomic transaction. One component may succeed while another fails. Applications that require all-or-nothing behavior or guaranteed intent coverage must enforce that policy in their orchestration layer.

## Registration and addressing

A registration describes one mounted component instance. Its stable `id` is combined with each logical tool `key` to form an address. Two instances of the same reusable component can coexist because ownership is instance-specific. Duplicate active IDs are rejected rather than overwritten.

Registration handles carry an internal ownership token. Cleanup is idempotent, and a stale cleanup cannot unregister a newer owner that reused the same ID. This is what makes React Strict Mode setup, cleanup, and remount safe.

## Execution pipeline

Each accepted component tool call follows one pipeline:

```text
loading → input validation → host authorization → execution
        → output validation → developer mapping → success | empty
```

Each failure stage has a typed code. Render-facing failures contain a safe message rather than the raw cause; the controller's `onError` callback receives the typed error for host observability.

Every instance has its own subscription set. Updating one component does not notify unrelated component subscribers. Snapshots and manifests are cached until their corresponding state changes, which satisfies `useSyncExternalStore` identity requirements and avoids global rerender storms.

## Concurrency

Starting a request supersedes the current request for that component ID. The controller aborts the old signal and assigns the replacement a unique token. Token checks occur after every asynchronous boundary and before mapping or publishing state. Correctness therefore does not depend on an executor honoring `AbortSignal`.

A replacement loading snapshot can carry `previousProps` from the prior success. This lets a component show stale content with a progress indicator without misrepresenting the old props as the new result.

## Trust boundaries

Runtime schema validation is authoritative even when a model provider reports strict tool calling. Tool output is validated again in the browser before it can reach a component mapper.

Mounting a component changes discoverability, not authorization. Approval-required tools are denied when no host decision exists. Server AI integrations must resolve active addresses against server-owned definitions; client-supplied descriptions, schemas, approval rules, and executors are never authoritative.

Model-visible results default to the acknowledgement `Component data loaded.` Component data reaches the model only through an explicit developer projection in a same-runtime integration. Forwarded browser tools return a fixed receipt, and the server produces the model-visible acknowledgement from its own tool definition.

The client bridge scopes replay tracking to one chat, bounds tracked calls, deduplicates exact events, and fails closed when the same tool-call identity carries different input or terminal output.

## Server rendering

React registration happens only in effects. During server rendering, the hook uses a shared idle server snapshot and performs no registration or execution. The controller should be created and owned by the client application boundary that hosts interactive components.
