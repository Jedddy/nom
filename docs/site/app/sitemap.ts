import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import { absoluteUrl } from "@/lib/metadata";

// `output: export` treats a metadata route as dynamic unless told otherwise; without
// this the build stops rather than emitting the file.
export const dynamic = "force-static";

/**
 * Ranks a docs route so the sitemap reflects reading order rather than file order.
 *
 * `priority` is only a relative hint within one site, but the ordering here is the one
 * real signal available: entry points first, then the reference pages, then examples.
 */
function priorityFor(url: string): number {
  if (url === "/docs") return 0.9;
  if (url === "/docs/getting-started" || url === "/docs/concepts") return 0.9;
  if (url.startsWith("/docs/examples")) return 0.6;
  return 0.8;
}

/**
 * Emitted as a static `/sitemap.xml` by the export.
 *
 * `lastModified` is deliberately absent. Google ignores it unless it is consistently
 * accurate, and nothing here can produce an accurate value: `architecture.mdx` and
 * `ai-sdk.mdx` are one-line wrappers around markdown that lives outside this package,
 * so their own file timestamps stay frozen while the content they publish changes.
 * A wrong date is worse than no date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const docsPages = source.getPages().map((page) => ({
    url: absoluteUrl(page.url),
    changeFrequency: "weekly" as const,
    priority: priorityFor(page.url),
  }));

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...docsPages,
  ];
}
