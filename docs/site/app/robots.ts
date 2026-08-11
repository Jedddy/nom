import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/metadata";

// `output: export` treats a metadata route as dynamic unless told otherwise; without
// this the build stops rather than emitting the file.
export const dynamic = "force-static";

/**
 * Emitted as a static `/robots.txt` by the export.
 *
 * Everything here is public documentation, so the only job this file has is pointing
 * crawlers at the sitemap. Nothing is disallowed on purpose — in particular `/_next/`
 * stays crawlable, because it holds the CSS and JS Googlebot loads to render a page.
 * Blocking it makes the rendered page look broken to the crawler that judges it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
