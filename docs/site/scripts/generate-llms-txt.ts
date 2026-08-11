/**
 * Writes `public/llms.txt` and `public/llms-full.txt` before `next build` runs.
 *
 * Both are the llms.txt convention: one curated index an assistant can read to find the
 * right page, and one flat file holding the whole documentation set so it never has to
 * crawl. They matter here more than on most sites — nom's audience reaches it through
 * coding assistants, and this is the only form of the docs those assistants can read
 * without executing the site's JavaScript.
 *
 * The site is a static export, so these cannot be route handlers: a handler emitting
 * `/llms.txt` would land in the export as a directory under `trailingSlash: true`.
 * Files in `public/` are copied verbatim and served with the right content type.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nom.jpndev.xyz").replace(
  /\/$/,
  "",
);

const siteRoot = path.join(import.meta.dirname, "..");
const contentRoot = path.join(siteRoot, "content", "docs");
const publicRoot = path.join(siteRoot, "public");

const summary =
  "nom connects AI tool calls to React component props. An agent loads data into components that already exist in your application: you define the tools, validate their inputs and outputs, and map results to props, while your app keeps the model, the fetching, the authorization, and the rendering.";

type DocsPage = {
  readonly title: string;
  readonly description: string;
  /** Site-relative route, e.g. `/docs/concepts`. */
  readonly url: string;
  /** Page body with frontmatter stripped and `<include>` resolved. */
  readonly body: string;
};

type MetaJson = { readonly title?: string; readonly pages?: readonly string[] };

/**
 * Pulls `title` and `description` out of MDX frontmatter.
 *
 * Deliberately not a YAML parser: the frontmatter in this repository is two scalar keys,
 * and a dependency that can parse anchors and multi-line blocks would only add ways for
 * this script to disagree with what Fumadocs actually loaded.
 */
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }

  return { data, body: raw.slice(match[0].length) };
}

/**
 * Inlines `<include>../../../architecture.md</include>`.
 *
 * `architecture.mdx`, `ai-sdk.mdx` and `devtools.mdx` hold no prose of their own — they
 * publish markdown that lives at the repository root and also ships in the npm tarball.
 * Emitting the unresolved tag would leave three of the site's densest pages missing from
 * `llms-full.txt`.
 */
async function resolveIncludes(body: string, mdxPath: string): Promise<string> {
  const includes = [...body.matchAll(/<include>(.*?)<\/include>/g)];
  let resolved = body;

  for (const [tag, target] of includes) {
    const included = await readFile(
      path.resolve(path.dirname(mdxPath), target.trim()),
      "utf8",
    );
    resolved = resolved.replace(tag, included.trim());
  }

  return resolved;
}

/**
 * Walks `meta.json` rather than the directory listing, so the output carries the reading
 * order the sidebar shows instead of alphabetical order.
 */
async function collectPages(dir: string, urlPrefix: string): Promise<DocsPage[]> {
  const meta: MetaJson = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8"));
  const pages: DocsPage[] = [];

  for (const entry of meta.pages ?? []) {
    const mdxPath = path.join(dir, `${entry}.mdx`);
    const raw = await readFile(mdxPath, "utf8").catch(() => null);

    if (raw === null) {
      // Not a page: a subdirectory with its own meta.json, e.g. `examples`.
      pages.push(...(await collectPages(path.join(dir, entry), `${urlPrefix}/${entry}`)));
      continue;
    }

    const { data, body } = parseFrontmatter(raw);
    pages.push({
      title: data.title ?? entry,
      description: data.description ?? "",
      url: entry === "index" ? urlPrefix : `${urlPrefix}/${entry}`,
      body: (await resolveIncludes(body, mdxPath)).trim(),
    });
  }

  return pages;
}

function toAbsolute(url: string): string {
  // `trailingSlash: true` makes the slashed form the canonical one; pointing an assistant
  // at the other form sends it through a redirect on every fetch.
  return `${siteUrl}${url.endsWith("/") ? url : `${url}/`}`;
}

/**
 * Rewrites in-page links like `[Concepts](/docs/concepts)` to absolute URLs.
 *
 * `llms-full.txt` is read detached from the site, so a root-relative href has nothing to
 * resolve against — and an assistant citing one produces a link that goes nowhere.
 */
function absolutizeLinks(markdown: string): string {
  return markdown.replace(/\]\((\/[^)\s]*)\)/g, (_, href: string) => `](${siteUrl}${href})`);
}

const pages = await collectPages(contentRoot, "/docs");

const index = [
  "# nom",
  "",
  `> ${summary}`,
  "",
  `Source: https://github.com/Jedddy/nom · Package: \`@nom-ai/sdk\` · License: MIT`,
  "",
  "## Documentation",
  "",
  ...pages.map(
    (page) =>
      `- [${page.title}](${toAbsolute(page.url)})${page.description ? `: ${page.description}` : ""}`,
  ),
  "",
  "## Optional",
  "",
  `- [Full documentation, single file](${siteUrl}/llms-full.txt): every page above concatenated as plain markdown.`,
  "",
].join("\n");

const full = [
  "# nom — full documentation",
  "",
  `> ${summary}`,
  "",
  `Generated from ${siteUrl}. Source: https://github.com/Jedddy/nom`,
  "",
  ...pages.flatMap((page) => [
    "---",
    "",
    `URL: ${toAbsolute(page.url)}`,
    "",
    absolutizeLinks(page.body),
    "",
  ]),
].join("\n");

await mkdir(publicRoot, { recursive: true });
await writeFile(path.join(publicRoot, "llms.txt"), index, "utf8");
await writeFile(path.join(publicRoot, "llms-full.txt"), full, "utf8");

console.log(`[seo] wrote public/llms.txt and public/llms-full.txt (${pages.length} pages)`);
