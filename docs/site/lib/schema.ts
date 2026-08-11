import { absoluteUrl, siteDescription, siteName, siteUrl } from "@/lib/metadata";

const publisher = {
  "@type": "Organization",
  "@id": `${siteUrl}/#publisher`,
  name: siteName,
  url: `${siteUrl}/`,
};

/**
 * The site-level graph, rendered on the landing page.
 *
 * `@id` values are stable URLs rather than generated ones so the docs graph can point at
 * these nodes instead of restating them — that is what makes a set of separate JSON-LD
 * blocks read as one entity to a consumer rather than as unrelated fragments.
 */
export function siteSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      publisher,
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: siteName,
        description: siteDescription,
        inLanguage: "en",
        publisher: { "@id": publisher["@id"] },
      },
      {
        // SoftwareSourceCode rather than SoftwareApplication: nom is a library consumed
        // from source, not something a reader installs and runs on a device.
        "@type": "SoftwareSourceCode",
        "@id": `${siteUrl}/#software`,
        name: "@nom-ai/sdk",
        description: siteDescription,
        url: `${siteUrl}/`,
        codeRepository: "https://github.com/Jedddy/nom",
        programmingLanguage: ["TypeScript", "JavaScript"],
        runtimePlatform: "React",
        license: "https://opensource.org/licenses/MIT",
        author: { "@id": publisher["@id"] },
      },
    ],
  };
}

type DocsPageSchemaInput = {
  readonly title: string;
  readonly description: string;
  /** Route the page is served at, e.g. `/docs/examples/dashboard`. */
  readonly url: string;
  /** Trail from the site root to this page, root first, this page last. */
  readonly breadcrumb: readonly { readonly name: string; readonly url: string }[];
};

/**
 * The per-page graph for a documentation page.
 *
 * TechArticle is the narrowest type that fits reference documentation, and the
 * BreadcrumbList is what lets a search result show `nom › Docs › Concepts` instead of a
 * bare URL — worth more on a deep docs page than on anything else on the site.
 */
export function docsPageSchema({
  title,
  description,
  url,
  breadcrumb,
}: DocsPageSchemaInput) {
  const pageUrl = absoluteUrl(url);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${pageUrl}#article`,
        headline: title,
        name: title,
        description,
        url: pageUrl,
        inLanguage: "en",
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#software` },
        publisher: { "@id": publisher["@id"] },
        // Documentation for a developer library assumes the reader can already write the
        // language it is written in; stating that is a genuine audience signal.
        proficiencyLevel: "Expert",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: breadcrumb.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: absoluteUrl(crumb.url),
        })),
      },
    ],
  };
}
