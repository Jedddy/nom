"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowUpIcon, CircleAlertIcon, SparklesIcon } from "lucide-react";
import {
  AgentComponent,
  AgentComponentController,
  AgentComponentProvider,
  type AgentComponentResult,
  defineAgentTool,
} from "nom";
import { AISDKClientBridge, createAIToolRouting, toActiveAgentManifest } from "nom/ai-sdk";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AgentRouteFailure,
  type AgentRouteSuccess,
  type OrdersResult,
  type SalesOverviewData,
  filterOrdersInputSchema,
  loadSalesInputSchema,
  ordersResultSchema,
  salesOverviewSchema,
} from "../lib/agent-contracts";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("en-US");

const initialSales: SalesOverviewData = {
  rangeLabel: "Today",
  revenue: 24_860,
  orders: 184,
  conversionRate: 4.8,
  updatedAt: "Just now",
};

const initialOrders: OrdersResult = {
  rangeLabel: "Recent orders",
  orders: [
    {
      id: "ORD-1048",
      customer: "Acme Studio",
      status: "at-risk",
      placedAt: "Jul 22, 2026",
      total: 1_840,
    },
    {
      id: "ORD-1047",
      customer: "Northstar Labs",
      status: "pending",
      placedAt: "Jul 18, 2026",
      total: 720,
    },
    {
      id: "ORD-1046",
      customer: "Juniper Goods",
      status: "completed",
      placedAt: "Jul 15, 2026",
      total: 1_260,
    },
  ],
};

const loadSales = defineAgentTool({
  key: "load-sales",
  description: "Load aggregate sales metrics for any inclusive date range up to 366 days.",
  inputSchema: loadSalesInputSchema,
  outputSchema: salesOverviewSchema,
  async execute({ startDate, endDate }, { signal }) {
    const query = new URLSearchParams({ startDate, endDate });
    const response = await fetch(`/api/sales?${query}`, { signal });
    if (!response.ok) throw new Error("Sales could not be loaded.");
    return response.json();
  },
  mapOutput(output): AgentComponentResult<SalesOverviewData> {
    return { status: "success", props: output };
  },
});

const filterOrders = defineAgentTool({
  key: "filter-orders",
  description:
    "Load individual orders for an optional inclusive date range, status, and customer or order search.",
  inputSchema: filterOrdersInputSchema,
  outputSchema: ordersResultSchema,
  async execute({ status, search, startDate, endDate }, { signal }) {
    const query = new URLSearchParams({ status });
    if (search) query.set("search", search);
    if (startDate && endDate) {
      query.set("startDate", startDate);
      query.set("endDate", endDate);
    }

    const response = await fetch(`/api/orders?${query}`, { signal });
    if (!response.ok) throw new Error("Orders could not be loaded.");
    return response.json();
  },
  mapOutput(output): AgentComponentResult<OrdersResult> {
    return output.orders.length === 0 ? { status: "empty" } : { status: "success", props: output };
  },
});

export function AgentDashboard() {
  const [controller] = useState(() => new AgentComponentController());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const updateReadyState = () => {
      setIsReady(controller.getManifest().components.length === 2);
    };

    updateReadyState();
    return controller.subscribeRegistry(updateReadyState);
  }, [controller]);

  return (
    <AgentComponentProvider controller={controller}>
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Dashboard</p>
            <h1 className="text-2xl font-semibold tracking-tight">Commerce overview</h1>
          </div>
          <Badge variant={isReady ? "secondary" : "outline"}>
            {isReady ? "Agent ready" : "Mounting"}
          </Badge>
        </header>

        <AgentPrompt controller={controller} isReady={isReady} />
        <AgentSalesOverview />
        <AgentOrdersTable />
      </main>
    </AgentComponentProvider>
  );
}

function AgentPrompt({
  controller,
  isReady,
}: {
  readonly controller: AgentComponentController;
  readonly isReady: boolean;
}) {
  const [prompt, setPrompt] = useState("Show sales and orders from July 1 to July 15");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = prompt.trim();
    if (!request || isSubmitting || !isReady) return;

    setIsSubmitting(true);
    setError(undefined);

    try {
      const manifest = toActiveAgentManifest(controller.getManifest());
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: request, manifest }),
      });
      const result = (await response.json()) as AgentRouteSuccess | AgentRouteFailure;

      if (!response.ok || "error" in result) {
        throw new Error("error" in result ? result.error : "The request failed.");
      }

      const bridge = new AISDKClientBridge({
        chatId: crypto.randomUUID(),
        controller,
        routing: createAIToolRouting(manifest),
      });

      for (const toolCall of result.toolCalls) {
        await bridge.handleToolCall(toolCall, () => undefined);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "The request could not be completed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask the dashboard</CardTitle>
        <CardDescription>Update one or more mounted components with one request.</CardDescription>
        <CardAction>
          <Badge variant="outline">
            <SparklesIcon data-icon="inline-start" />
            AI
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-disabled={isSubmitting || undefined}>
              <FieldLabel htmlFor="agent-prompt">Request</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="agent-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
                <Button type="submit" disabled={!isReady || isSubmitting || !prompt.trim()}>
                  {isSubmitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <ArrowUpIcon data-icon="inline-start" />
                  )}
                  {isSubmitting ? "Running" : "Run"}
                </Button>
              </div>
              <FieldDescription>
                The model can only select mounted component tools.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function AgentSalesOverview() {
  return (
    <AgentComponent
      id="sales-overview"
      instructions="Use this component for aggregate sales, revenue, order count, and conversion metrics."
      tools={[loadSales]}
    >
      {(snapshot) => {
        if (snapshot.status === "loading") return <SalesSkeleton />;

        if (snapshot.status === "failure") {
          return (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Sales could not be loaded</AlertTitle>
              <AlertDescription>{snapshot.error.message}</AlertDescription>
            </Alert>
          );
        }

        return <SalesCards data={snapshot.status === "success" ? snapshot.props : initialSales} />;
      }}
    </AgentComponent>
  );
}

function AgentOrdersTable() {
  return (
    <AgentComponent
      id="orders-table"
      instructions="Use this component to view, date-filter, status-filter, or search individual orders."
      tools={[filterOrders]}
    >
      {(snapshot) => {
        if (snapshot.status === "loading") return <OrdersSkeleton />;

        if (snapshot.status === "failure") {
          return (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Orders could not be loaded</AlertTitle>
              <AlertDescription>{snapshot.error.message}</AlertDescription>
            </Alert>
          );
        }

        return (
          <OrdersCard
            data={
              snapshot.status === "success"
                ? snapshot.props
                : snapshot.status === "empty"
                  ? { rangeLabel: "No matching orders", orders: [] }
                  : initialOrders
            }
          />
        );
      }}
    </AgentComponent>
  );
}

function SalesCards({ data }: { readonly data: SalesOverviewData }) {
  const metrics = [
    { label: "Revenue", value: currency.format(data.revenue), detail: "Gross sales" },
    { label: "Orders", value: integer.format(data.orders), detail: "Processed orders" },
    { label: "Conversion", value: `${data.conversionRate}%`, detail: "Visitor to order" },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Sales overview">
      {metrics.map((metric, index) => (
        <Card key={metric.label} size="sm">
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            {index === 0 && (
              <CardAction>
                <Badge variant="secondary">{data.rangeLabel}</Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">{metric.value}</p>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{metric.detail}</span>
              <span>{data.updatedAt}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function OrdersCard({ data }: { readonly data: OrdersResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>{data.rangeLabel}</CardDescription>
        <CardAction>
          <Badge variant="secondary">{data.orders.length} results</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Placed</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">{order.id}</TableCell>
                <TableCell>{order.customer}</TableCell>
                <TableCell>
                  <Badge variant="outline">{order.status}</Badge>
                </TableCell>
                <TableCell>{order.placedAt}</TableCell>
                <TableCell className="text-right">{currency.format(order.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SalesSkeleton() {
  return (
    <section
      className="grid gap-3 sm:grid-cols-3"
      aria-label="Loading sales overview"
      aria-busy="true"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function OrdersSkeleton() {
  return (
    <Card aria-label="Loading orders" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
