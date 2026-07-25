"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CircleAlertIcon, PackageSearchIcon, SearchIcon, SparklesIcon } from "lucide-react";
import {
  AgentComponent,
  AgentComponentController,
  AgentComponentProvider,
  type AgentComponentResult,
  defineAgentTool,
} from "@nom-ai/sdk";
import { AISDKClientBridge, createAIToolRouting, toActiveAgentManifest } from "@nom-ai/sdk/ai-sdk";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  type AgentRouteFailure,
  type AgentRouteSuccess,
  type ProductSearchResult,
  productSearchResultSchema,
  searchProductsInputSchema,
} from "../lib/agent-contracts";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const searchProducts = defineAgentTool({
  key: "search-products",
  description: "Search and display products by name, category, feature, budget, and availability.",
  inputSchema: searchProductsInputSchema,
  outputSchema: productSearchResultSchema,
  async execute({ query, maxPrice, inStockOnly }, { signal }) {
    const search = new URLSearchParams({ query });
    if (maxPrice !== undefined) search.set("maxPrice", String(maxPrice));
    if (inStockOnly !== undefined) search.set("inStockOnly", String(inStockOnly));

    const response = await fetch(`/api/products?${search}`, { signal });
    if (!response.ok) throw new Error("Products could not be loaded.");
    return response.json();
  },
  mapOutput(output): AgentComponentResult<ProductSearchResult> {
    return output.products.length === 0
      ? { status: "empty" }
      : { status: "success", props: output };
  },
});

export function AgentProductSearch() {
  const [controller] = useState(() => new AgentComponentController());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const updateReadyState = () => {
      setIsReady(controller.getManifest().components.length === 1);
    };

    updateReadyState();
    return controller.subscribeRegistry(updateReadyState);
  }, [controller]);

  return (
    <AgentComponentProvider controller={controller}>
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Catalog</p>
            <h1 className="text-2xl font-semibold tracking-tight">Product search</h1>
          </div>
          <Badge variant={isReady ? "secondary" : "outline"}>
            {isReady ? "Agent ready" : "Mounting"}
          </Badge>
        </header>

        <SearchPrompt controller={controller} isReady={isReady} />
        <ProductResults />
      </main>
    </AgentComponentProvider>
  );
}

function SearchPrompt({
  controller,
  isReady,
}: {
  readonly controller: AgentComponentController;
  readonly isReady: boolean;
}) {
  const [prompt, setPrompt] = useState("Find wireless keyboards under $150");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = prompt.trim();
    if (!request || !isReady || isSubmitting) return;

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
        <CardTitle>Search with AI</CardTitle>
        <CardDescription>Describe the products and filters you need.</CardDescription>
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
              <FieldLabel htmlFor="product-prompt">Request</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="product-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={isSubmitting}
                  autoComplete="off"
                />
                <Button type="submit" disabled={!isReady || isSubmitting || !prompt.trim()}>
                  {isSubmitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <SearchIcon data-icon="inline-start" />
                  )}
                  {isSubmitting ? "Searching" : "Search"}
                </Button>
              </div>
              <FieldDescription>Try a product, feature, budget, or availability.</FieldDescription>
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

function ProductResults() {
  return (
    <AgentComponent
      id="product-results"
      instructions="Use this component whenever the user wants to find, browse, compare, or filter products."
      tools={[searchProducts]}
    >
      {(snapshot) => {
        if (snapshot.status === "loading") return <ProductSkeleton />;

        if (snapshot.status === "failure") {
          return (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Products could not be loaded</AlertTitle>
              <AlertDescription>{snapshot.error.message}</AlertDescription>
            </Alert>
          );
        }

        if (snapshot.status === "success") return <ProductGrid result={snapshot.props} />;

        return <ProductEmpty searched={snapshot.status === "empty"} />;
      }}
    </AgentComponent>
  );
}

function ProductGrid({ result }: { readonly result: ProductSearchResult }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Product results">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{result.summary}</p>
        <Badge variant="secondary">{result.products.length} results</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.products.map((product) => (
          <Card key={product.id} size="sm">
            <CardHeader>
              <CardTitle>{product.name}</CardTitle>
              <CardDescription>{product.category}</CardDescription>
              <CardAction>
                <Badge variant={product.inStock ? "secondary" : "outline"}>
                  {product.inStock ? "In stock" : "Out of stock"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{product.description}</p>
            </CardContent>
            <CardFooter>
              <p className="font-semibold">{currency.format(product.price)}</p>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ProductEmpty({ searched }: { readonly searched: boolean }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageSearchIcon />
        </EmptyMedia>
        <EmptyTitle>{searched ? "No products found" : "Search your catalog"}</EmptyTitle>
        <EmptyDescription>
          {searched
            ? "Try broader keywords or remove a filter."
            : "Describe what you need and the results will appear here."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ProductSkeleton() {
  return (
    <section
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading products"
      aria-busy="true"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index} size="sm">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-5 w-16" />
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}
