import { z } from "zod";

const millisecondsPerDay = 24 * 60 * 60 * 1_000;
const maximumDateRangeDays = 366;

const startDateSchema = z.iso
  .date()
  .describe("The first date to include, formatted as YYYY-MM-DD.");
const endDateSchema = z.iso.date().describe("The last date to include, formatted as YYYY-MM-DD.");

export const loadSalesInputSchema = z
  .object({
    startDate: startDateSchema,
    endDate: endDateSchema,
  })
  .superRefine(validateDateRange);

export const filterOrdersInputSchema = z
  .object({
    status: z
      .enum(["all", "pending", "at-risk", "completed"])
      .describe("The order status to display."),
    search: z
      .string()
      .max(80)
      .optional()
      .describe("An optional customer name or order number to search for."),
    startDate: startDateSchema
      .optional()
      .describe("The first order date to include. Use with endDate."),
    endDate: endDateSchema
      .optional()
      .describe("The last order date to include. Use with startDate."),
  })
  .superRefine(validateDateRange);

export const salesOverviewSchema = z.object({
  rangeLabel: z.string(),
  revenue: z.number(),
  orders: z.number().int(),
  conversionRate: z.number(),
  updatedAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.enum(["pending", "at-risk", "completed"]),
  placedAt: z.string(),
  total: z.number(),
});

export const ordersResultSchema = z.object({
  rangeLabel: z.string(),
  orders: z.array(orderSchema),
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

export type SalesOverviewData = z.infer<typeof salesOverviewSchema>;
export type OrdersResult = z.infer<typeof ordersResultSchema>;

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

function validateDateRange(
  { startDate, endDate }: { readonly startDate?: string; readonly endDate?: string },
  context: z.RefinementCtx,
) {
  if (!startDate || !endDate) {
    if (startDate !== endDate) {
      context.addIssue({
        code: "custom",
        message: "Provide both startDate and endDate when filtering by date.",
        path: [startDate ? "endDate" : "startDate"],
      });
    }
    return;
  }

  const startTime = Date.parse(`${startDate}T00:00:00Z`);
  const endTime = Date.parse(`${endDate}T00:00:00Z`);
  const rangeDays = (endTime - startTime) / millisecondsPerDay + 1;

  if (endTime < startTime) {
    context.addIssue({
      code: "custom",
      message: "The end date must be on or after the start date.",
      path: ["endDate"],
    });
  } else if (rangeDays > maximumDateRangeDays) {
    context.addIssue({
      code: "custom",
      message: `The date range cannot exceed ${maximumDateRangeDays} days.`,
      path: ["endDate"],
    });
  }
}
