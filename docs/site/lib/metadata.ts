import type { Metadata } from "next";
import { ogAlt, ogSize } from "@/components/og-card";

/**
 * Absolute origin the site is served from. Every canonical URL, Open Graph URL, sitemap
 * entry and JSON-LD `@id` is built from this, so a preview deployment can point them all
 * somewhere else by setting `NEXT_PUBLIC_SITE_URL` at build time.
 *
 * It has to be absolute: `metadataBase` is what turns the relative paths below into the
 * absolute URLs that crawlers and link unfurlers require.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://nom.jpndev.xyz"
).replace(/\/$/, "");

export const siteName = "nom";

export const siteDescription =
  "Connect AI tool calls to React component props. Define the tools, validate their inputs and outputs, and map results to props — your app keeps the model, fetching, authorization, and rendering.";

/**
 * Builds the absolute URL for a route.
 *
 * `next.config.ts` sets `trailingSlash: true`, so the emitted HTML lives at
 * `/docs/concepts/index.html` and the canonical form of the route carries the slash.
 * Advertising `/docs/concepts` instead would name a URL that answers with a redirect,
 * which is exactly the duplicate-URL signal canonical tags exist to remove.
 */
export function absoluteUrl(pathname: string): string {
  if (pathname === "/") return `${siteUrl}/`;
  const normalized = `/${pathname.replace(/^\/|\/$/g, "")}/`;
  return `${siteUrl}${normalized}`;
}

type CreateMetadataInput = {
  readonly title: string;
  readonly description: string;
  /** Route this page is canonically served at, e.g. `/docs/concepts`. */
  readonly pathname: string;
  /** Set for pages that read as documents rather than as the site itself. */
  readonly type?: "website" | "article";
};

/**
 * The metadata every page shares, with the three fields that differ per page filled in.
 *
 * Kept in one place because the failure mode is silent: a page that omits `canonical`
 * or ships the site-wide description still renders fine and only shows up as thin or
 * duplicated content weeks later in Search Console.
 */
export function createMetadata({
  title,
  description,
  pathname,
  type = "article",
}: CreateMetadataInput): Metadata {
  const url = absoluteUrl(pathname);

  // Next.js replaces `openGraph` and `twitter` wholesale rather than merging them field
  // by field, so anything the root layout set — the card image above all — is gone the
  // moment a page declares its own. Every field a page needs has to be restated here.
  const image = { url: "/og.png", alt: ogAlt };

  // `title` alone renders as a bare "Concepts" in a shared link, with nothing naming the
  // project. The root layout's title template does not reach Open Graph.
  const socialTitle = `${title} — ${siteName}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName,
      title: socialTitle,
      description,
      locale: "en_US",
      images: [{ ...image, ...ogSize, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}
