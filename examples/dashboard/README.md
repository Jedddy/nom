# Dashboard example

A compact Next.js App Router example where one prompt can update one or several shadcn components. Copy these files into an existing application; this directory is not a standalone app.

## Install

```bash
npm install nom ai @ai-sdk/openai zod
npx shadcn@latest add alert badge button card field input skeleton spinner table
```

Set `OPENAI_API_KEY` in `.env.local`, then copy:

- `components/agent-dashboard.tsx`
- `lib/agent-contracts.ts`
- `app/api/agent/route.ts`

Render the dashboard from a page:

```tsx
import { AgentDashboard } from "@/components/agent-dashboard";

export default function Page() {
  return <AgentDashboard />;
}
```

The model selects components from the mounted manifest:

- “Show sales from July 1 to July 15” updates the sales cards.
- “Show pending orders” updates the orders table.
- “Show sales and orders from July 1 to July 15” can update both.

The example calls your application endpoints with exact dates:

```text
GET /api/sales?startDate=2026-07-01&endDate=2026-07-15
GET /api/orders?status=all&startDate=2026-07-01&endDate=2026-07-15
```

`/api/sales` returns:

```json
{
  "rangeLabel": "Jul 1–15, 2026",
  "revenue": 340326,
  "orders": 2697,
  "conversionRate": 4.3,
  "updatedAt": "Just now"
}
```

`/api/orders` returns:

```json
{
  "rangeLabel": "Jul 1–15, 2026",
  "orders": [
    {
      "id": "ORD-1046",
      "customer": "Juniper Goods",
      "status": "completed",
      "placedAt": "Jul 15, 2026",
      "total": 1260
    }
  ]
}
```

Replace those endpoints with your data layer. The route instructs the model to return every relevant component call and forwards every routed call it receives. Selection is still model-directed; add host-side validation if your product requires deterministic coverage. The default date tool includes model-facing documentation explaining exactly when it should be used.
