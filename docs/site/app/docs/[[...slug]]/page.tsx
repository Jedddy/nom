import { notFound } from "next/navigation";
import { DocsBody, DocsPage } from "fumadocs-ui/page";
import { source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";
import { JsonLd } from "@/components/json-ld";
import { docsPageSchema } from "@/lib/schema";
import { createMetadata, siteDescription, siteName } from "@/lib/metadata";

type PageProps = {
  readonly params: Promise<{ slug?: string[] }>;
};

/**
 * Builds the trail from the site root down to this page.
 *
 * Only slug prefixes that resolve to a real page become links. `content/docs/examples`
 * is a folder with no index page, so `/docs/examples` would 404 — listing it as a
 * breadcrumb link would advertise a broken URL to every crawler that reads the graph.
 */
function breadcrumbFor(slug: string[] | undefined) {
  const trail = [{ name: siteName, url: "/" }];
  const segments = slug ?? [];

  for (let depth = 0; depth <= segments.length; depth++) {
    const page = source.getPage(segments.slice(0, depth));
    if (page) trail.push({ name: page.data.title, url: page.url });
  }

  return trail;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    // Each page's body owns its own heading. Pages that include a repository markdown
    // file inherit that file's H1, so rendering a frontmatter title here would print
    // the same heading twice. Frontmatter still drives the sidebar and page metadata.
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <JsonLd
        schema={docsPageSchema({
          title: page.data.title,
          description: page.data.description ?? siteDescription,
          url: page.url,
          breadcrumb: breadcrumbFor(slug),
        })}
      />
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return createMetadata({
    title: page.data.title,
    // A page with no frontmatter description would otherwise ship an empty one, which
    // hands the search snippet back to whatever the crawler scrapes off the page.
    description: page.data.description ?? siteDescription,
    pathname: page.url,
    type: "article",
  });
}
