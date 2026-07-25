# Product search example

A compact Next.js App Router example where a natural-language request searches a product catalog and updates shadcn product cards. Copy these files into an existing application; this directory is not a standalone app.

## Install

```bash
npm install @nom-ai/sdk ai @ai-sdk/openai lucide-react zod
npx shadcn@latest add alert badge button card empty field input skeleton spinner
```

Set `OPENAI_API_KEY` in `.env.local`, then copy:

- `components/agent-product-search.tsx`
- `lib/agent-contracts.ts`
- `app/api/agent/route.ts`

Render the component from a page:

```tsx
import { AgentProductSearch } from "@/components/agent-product-search";

export default function Page() {
  return <AgentProductSearch />;
}
```

Try requests such as:

- “Find wireless keyboards under $150”
- “Show in-stock running shoes”
- “Find noise-cancelling headphones”

The component tool translates the selected filters into a request to your application:

```text
GET /api/products?query=wireless+keyboards&maxPrice=150
```

Return data in this shape:

```json
{
  "summary": "Wireless keyboards under $150",
  "products": [
    {
      "id": "keyboard-01",
      "name": "Slim Wireless Keyboard",
      "description": "Compact low-profile keyboard with multi-device pairing.",
      "category": "Keyboards",
      "price": 89,
      "inStock": true
    }
  ]
}
```

Replace `/api/products` with your own data layer. The tool description tells the model when product search is relevant, while the input schema documents how to map the request into filters.
