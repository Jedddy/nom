# nom

Connect AI tool calls to React component props.

`nom` lets an agent load data into components already in your application. You define the tools, validate their inputs and outputs, and map the results to props. Your application keeps ownership of the model, data fetching, authorization, and rendering.

**[Documentation →](https://nom.jpndev.xyz)** — concepts, a full getting-started walkthrough, and the examples.

## Installation

```bash
bun add @nom-ai/sdk zod
```

The examples use Zod 4. You can use another schema library that implements Standard Schema and Standard JSON Schema.

## Quick start

Create one controller and mount its provider near your application root:

```tsx
// src/agent-components.tsx
"use client";

import type { ReactNode } from "react";
import { AgentComponentController, AgentComponentProvider } from "@nom-ai/sdk";

export const agentComponents = new AgentComponentController();

export function AgentComponentsProvider({ children }: { readonly children: ReactNode }) {
  return <AgentComponentProvider controller={agentComponents}>{children}</AgentComponentProvider>;
}
```

```tsx
<AgentComponentsProvider>
  <App />
</AgentComponentsProvider>
```

Register an existing component and describe how tool output becomes its props:

```tsx
// src/components/AgentProductTable.tsx
import { z } from "zod";
import { AgentComponent, defineAgentTool } from "@nom-ai/sdk";
import { ProductTable } from "./ProductTable";
import { ProductTableSkeleton } from "./ProductTableSkeleton";

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});

const searchProducts = defineAgentTool({
  key: "search-products",
  description: "Find products matching a search query.",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ products: z.array(productSchema) }),
  execute: async ({ query }) => {
    const response = await fetch(`/api/products?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("Could not load products.");
    return response.json();
  },
  mapOutput: ({ products }) =>
    products.length === 0 ? { status: "empty" } : { status: "success", props: { products } },
});

export function AgentProductTable() {
  return (
    <AgentComponent
      id="product-table"
      instructions="Use this component when the user wants to find or compare products."
      tools={[searchProducts]}
    >
      {(snapshot) => (
        <section aria-busy={snapshot.status === "loading"}>
          {snapshot.status === "loading" && <ProductTableSkeleton />}
          {snapshot.status === "failure" && <p>{snapshot.error.message}</p>}
          {snapshot.status === "empty" && <p>No products found.</p>}
          {snapshot.status === "success" && <ProductTable products={snapshot.props.products} />}
        </section>
      )}
    </AgentComponent>
  );
}
```

`ProductTable` can be your own component or one composed from shadcn components. Keep callbacks, refs, JSX, and static configuration in your application; map only validated data to props.

## Connect an agent

`nom` is model-provider neutral. When your agent host and React components share a JavaScript runtime, you can call the controller directly:

```ts
await agentComponents.execute({
  componentId: "product-table",
  toolKey: "search-products",
  input: { query: "wireless keyboard" },
});
```

Or install AI SDK 6 and expose every active component tool to the model:

```bash
npm install ai
```

```ts
import { generateText } from "ai";
import { createAISDKTools } from "@nom-ai/sdk/ai-sdk";

const { tools } = createAISDKTools(agentComponents);

await generateText({
  model,
  prompt: "Show me wireless keyboards",
  tools,
});
```

The adapter exposes every mounted capability; it does not decide how many components a request should update. Depending on the prompt and your agent configuration, the model may return no component call, one call, or calls for several components. Execute every returned call whose name exists in `adapter.routing`. If your application requires guaranteed coverage of the user's intent, validate or orchestrate that requirement in the host.

For a web application where the model runs on the server and components run in the browser, use the client bridge described in the [AI SDK integration guide](docs/ai-sdk.md).

## Examples

- [Compact dashboard](examples/dashboard) — a copy-ready Next.js and shadcn example where a natural-language request can update sales, orders, or both.
- [Product search](examples/product-search) — a compact shadcn example where natural-language filters update product results.

## Default tools

Use `defaultTools` for host-owned context tools that are available independently of mounted components:

```ts
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createAISDKTools } from "@nom-ai/sdk/ai-sdk";

const getCurrentDate = tool({
  description:
    "Call this when a request uses relative dates or omits the year. Returns the current UTC date.",
  inputSchema: z.object({}),
  execute: () => ({ date: new Date().toISOString().slice(0, 10) }),
});

const adapter = createAISDKTools(agentComponents, {
  defaultTools: { get_current_date: getCurrentDate },
});

await generateText({
  model,
  prompt: "Show sales from yesterday",
  tools: adapter.tools,
  stopWhen: stepCountIs(5),
});
```

Every default tool must have a non-empty model-facing description that explains when to call it. Adapter creation rejects undocumented default tools. Default tools execute through AI SDK and are not routed to React components. Use a multi-step call when the model may need a default tool before choosing component tools. Context does not expand a component's contract: each target component's input schema must still represent the resolved value.

## Component lifecycle and the hook API

The `AgentComponent` render function receives one of five snapshots — `idle`, `loading`, `success`, `empty`, and `failure` — and only the latest request for a component can update it. `useAgentComponent` takes the same arguments and returns the snapshot directly when a render prop does not fit your structure.

See [Concepts](https://nom.jpndev.xyz/docs/concepts) for what each state means and [Getting Started](https://nom.jpndev.xyz/docs/getting-started) for the hook in context.

## Authorization

Tools marked with `approval: "required"` are denied unless the controller receives an authorization policy:

```ts
const agentComponents = new AgentComponentController({
  authorize: ({ componentId, toolKey, input }) =>
    authorizeToolCall({ componentId, toolKey, input }),
});
```

## Package exports

| Import               | Purpose                                 |
| -------------------- | --------------------------------------- |
| `@nom-ai/sdk`        | React components, hooks, and core APIs. |
| `@nom-ai/sdk/core`   | React-free controller and contracts.    |
| `@nom-ai/sdk/react`  | React integration.                      |
| `@nom-ai/sdk/ai-sdk` | AI SDK 6 adapter.                       |

React 18.3 and 19 are supported. The `ai` package is an optional peer dependency required only when importing `@nom-ai/sdk/ai-sdk`.

See [Architecture](docs/architecture.md) for the protocol, concurrency behavior, and trust boundaries.

## Development

```bash
bun install
bun run check
```
