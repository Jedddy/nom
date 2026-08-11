import type { Metadata } from "next";
import Link from "next/link";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

/**
 * Overrides the root layout's `index, follow`, which the exported `404.html` would
 * otherwise carry alongside the `noindex` Next.js injects — two contradictory robots
 * directives on the one page that must never be indexed.
 */
export const metadata: Metadata = {
  title: { absolute: "Page not found — nom" },
  robots: { index: false, follow: false },
};

/** nginx serves the exported `404.html` for any unmatched path (`error_page` in
 *  nginx.conf), so this is the 404 every visitor and crawler sees. */
export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
        <p className="font-mono text-sm text-fd-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fd-foreground sm:text-4xl">
          That page does not exist.
        </h1>
        <p className="leading-relaxed text-fd-muted-foreground">
          The link may be out of date, or the page may have moved.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/docs"
            className="inline-flex h-11 items-center rounded-lg bg-fd-primary px-6 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Documentation
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-lg border border-fd-border px-6 font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            Home
          </Link>
        </div>
      </div>
    </HomeLayout>
  );
}
