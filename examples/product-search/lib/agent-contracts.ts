import { z } from "zod";

export const searchProductsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("The product name, category, feature, or keywords to search for."),
  maxPrice: z
    .number()
    .positive()
    .optional()
    .describe("The maximum price per product in USD, when the user specifies a budget."),
  inStockOnly: z
    .boolean()
    .optional()
    .describe("Whether to return only products that are currently in stock."),
});

export const productSearchResultSchema = z.object({
  summary: z.string(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.string(),
      price: z.number().nonnegative(),
      inStock: z.boolean(),
    }),
  ),
});

export const agentRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(500),
  manifest: z.object({
    version: z.number().int().nonnegative(),
    components: z.array(
      z.object({
        id: z.string().min(1),
        tools: z.array(z.object({ key: z.string().min(1) })),
      }),
    ),
  }),
});

export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;

export interface AgentRouteSuccess {
  readonly toolCalls: readonly {
    readonly toolName: string;
    readonly toolCallId: string;
    readonly input: unknown;
  }[];
}

export interface AgentRouteFailure {
  readonly error: string;
}
