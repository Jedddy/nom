import Link from "next/link";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { DemoSlot } from "@/components/demo-slot";
import { DemoIllustration } from "@/components/demo-illustration";

const toolSample = `const searchProducts = defineAgentTool({
  key: "search-products",
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ products: z.array(productSchema) }),
  execute: ({ query }) => fetch(\`/api/products?q=\${query}\`).then((r) => r.json()),
  mapOutput: ({ products }) =>
    products.length === 0
      ? { status: "empty" }
      : { status: "success", props: { products } },
});`;

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-6 py-16 sm:py-24">
        <section className="flex flex-col gap-6">
          <p className="font-mono text-sm text-fd-muted-foreground">@nom-ai/sdk</p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-fd-foreground sm:text-5xl sm:leading-[1.1]">
            Connect AI tool calls to React component props.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-fd-muted-foreground">
            An agent loads data into components already in your application. You define
            the tools, validate their inputs and outputs, and map results to props — your
            app keeps the model, the fetching, the authorization, and the rendering.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/docs/getting-started"
              className="inline-flex h-11 items-center rounded-lg bg-fd-primary px-6 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
            <Link
              href="/docs/concepts"
              className="inline-flex h-11 items-center rounded-lg border border-fd-border px-6 font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
            >
              Read the concepts
            </Link>
            <code className="ml-1 hidden rounded-lg border border-fd-border bg-fd-muted/50 px-3 py-2 font-mono text-sm text-fd-muted-foreground sm:inline-block">
              bun add @nom-ai/sdk
            </code>
          </div>
        </section>

        {/* The demo comes before any code: a stranger should see what nom does before
            being asked to read an API. */}
        <section className="flex flex-col gap-4">
          <DemoSlot
            fallback={<DemoIllustration />}
            transcript={
              <>
                <strong className="font-medium text-fd-foreground">Illustration.</strong>{" "}
                One request reaches two components. The agent resolves the dates, calls
                both component tools, and each component moves through its own lifecycle —
                sales has rendered, orders is still loading. No page navigation, and the
                data never renders inside a chat bubble. The components were already there.
              </>
            }
          />
        </section>

        <section className="grid gap-10 md:grid-cols-2 md:gap-12">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-fd-foreground">
              You define the contract
            </h2>
            <p className="leading-relaxed text-fd-muted-foreground">
              A tool declares its input and output schemas, how to execute, and how the
              result becomes props. Validation runs at runtime even when a provider
              reports strict tool calling, and again in the browser before anything
              reaches a component.
            </p>
            <Link
              href="/docs/getting-started"
              className="text-sm font-medium text-fd-primary underline-offset-4 hover:underline"
            >
              Full walkthrough →
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card p-4 text-[13px] leading-relaxed">
            <code className="font-mono text-fd-foreground">{toolSample}</code>
          </pre>
        </section>

        <section className="grid gap-8 border-t border-fd-border pt-12 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-fd-foreground">Five states, not two</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              <code className="font-mono text-xs">idle</code>,{" "}
              <code className="font-mono text-xs">loading</code>,{" "}
              <code className="font-mono text-xs">success</code>,{" "}
              <code className="font-mono text-xs">empty</code>, and{" "}
              <code className="font-mono text-xs">failure</code>. &ldquo;Matched
              nothing&rdquo; is its own state, so you never infer it from a zero-length
              list.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-fd-foreground">Instances, not types</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Two copies of the same component stay independently addressable. Duplicate
              IDs are rejected loudly rather than silently overwriting each other.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-fd-foreground">The model is not trusted</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Mounting changes discoverability, not authorization. Component data reaches
              the model only through a projection you write.
            </p>
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-fd-border pt-8 text-sm text-fd-muted-foreground">
          <Link href="/docs" className="hover:text-fd-foreground">
            Documentation
          </Link>
          <Link href="/docs/architecture" className="hover:text-fd-foreground">
            Architecture
          </Link>
          <Link href="/docs/examples/dashboard" className="hover:text-fd-foreground">
            Examples
          </Link>
          <a
            href="https://github.com/Jedddy/nom"
            className="hover:text-fd-foreground"
            rel="noreferrer"
          >
            GitHub
          </a>
          <span className="ml-auto">MIT</span>
        </footer>
      </div>
    </HomeLayout>
  );
}
