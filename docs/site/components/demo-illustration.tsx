/**
 * A still illustration of one request updating two components — what the recording will
 * show once it exists. Labelled as an illustration so the page never implies it is live.
 */
export function DemoIllustration() {
  return (
    <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-fd-border bg-fd-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="ml-2 font-mono text-xs text-fd-muted-foreground">your dashboard</span>
      </div>

      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-lg border border-fd-border bg-fd-background px-3 py-2.5">
          <span className="shrink-0 rounded bg-fd-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fd-primary">
            ask
          </span>
          <p className="truncate text-sm text-fd-foreground">
            Show sales and orders from July 1 to July 15
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-fd-border bg-fd-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
              Sales
            </p>
            <p className="mt-2 font-mono text-2xl font-semibold text-fd-foreground">$340,326</p>
            <p className="mt-1 text-xs text-fd-muted-foreground">2,697 orders · Jul 1–15</p>
            <p className="mt-3 font-mono text-[11px] text-fd-primary">status: success</p>
          </div>

          <div className="rounded-lg border border-fd-border bg-fd-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fd-muted-foreground">
              Orders
            </p>
            <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
              <span className="h-3 w-full rounded bg-fd-muted" />
              <span className="h-3 w-4/5 rounded bg-fd-muted" />
              <span className="h-3 w-2/3 rounded bg-fd-muted" />
            </div>
            <p className="mt-3 font-mono text-[11px] text-fd-muted-foreground">status: loading</p>
          </div>
        </div>
      </div>
    </div>
  );
}
