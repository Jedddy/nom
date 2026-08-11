# nom documentation site

The site published at [nom.jpndev.xyz](https://nom.jpndev.xyz). Next.js App Router with
Tailwind v4 and [Fumadocs](https://fumadocs.dev) as the content layer, built as a static
export.

This is a separate package from the SDK at the repository root. It has its own dependency
tree and its own CI job — the root `bun run check` does not build or lint it, and
`docs/site` is listed in the repository's `.prettierignore`.

## Local development

```bash
bun install
bun dev            # http://localhost:3000
```

```bash
bun run build      # static export to out/
bun run lint
```

`bun run build` writes directory-style output (`out/docs/concepts/index.html`), so any
static server resolves the routes without rewrite rules.

## Layout

```text
app/
  layout.tsx                   root layout, fonts, Fumadocs provider
  page.tsx                     landing page
  globals.css                  Tailwind + Fumadocs theme
  docs/
    layout.tsx                 docs shell (sidebar, nav)
    [[...slug]]/page.tsx       renders any page from content/docs
  not-found.tsx                404 (nginx serves the exported 404.html)
  robots.ts                    /robots.txt
  sitemap.ts                   /sitemap.xml
components/                    landing-page components
content/docs/                  the documentation itself (MDX)
lib/
  source.ts                    content loader
  layout.shared.ts             nav options shared by both layouts
  metadata.ts                  site URL, canonical URLs, per-page metadata
  schema.ts                    JSON-LD graphs
scripts/                       run by `bun run build` before `next build`
source.config.ts               Fumadocs collection definition
```

## Metadata and SEO

Every page's `<head>` comes from `lib/metadata.ts`. Pages call `createMetadata()` rather
than returning a metadata object directly, because Next.js **replaces** `openGraph` and
`twitter` wholesale instead of merging them field by field — a page that declares its own
`openGraph` silently drops the card image the root layout set. Restating every field in
one helper is what keeps that from happening per page.

Canonical URLs carry a trailing slash to match `trailingSlash: true`. The other form
answers with a redirect, which is the duplicate-URL signal canonical tags exist to remove.

Frontmatter `description` is not optional in practice: it becomes the meta description,
the Open Graph description, the JSON-LD description, and the `llms.txt` entry. Aim for
120–155 characters — shorter than that leaves the search snippet half empty.

`app/sitemap.ts` deliberately emits no `lastModified`. `architecture.mdx`, `ai-sdk.mdx`
and `devtools.mdx` are one-line wrappers around markdown that lives outside this package,
so their own timestamps stay frozen while the content they publish changes.

### The site URL

`NEXT_PUBLIC_SITE_URL` overrides the `https://nom.jpndev.xyz` default at build time. It
has to be absolute — it is what turns every canonical, Open Graph, sitemap and JSON-LD
URL into an absolute one.

### Generated assets

`bun run build` runs `bun run generate:seo` first, which writes three gitignored files
into `public/`:

- **`og.png`** — the social card, rendered from `components/og-card.tsx` by
  `next/og`. It is generated to a file rather than served from an
  `app/opengraph-image.tsx` metadata route because under `output: export` that route
  lands in the export as an extensionless file named `opengraph-image`; a static server
  reports it as `application/octet-stream` and every link unfurler then ignores it.
- **`llms.txt`** and **`llms-full.txt`** — the curated index and the whole documentation
  set as one flat markdown file, walking `meta.json` so the order matches the sidebar and
  resolving `<include>` so the three wrapper pages are not empty. They cannot be route
  handlers for the same reason: `trailingSlash: true` would turn `/llms.txt` into a
  directory.

Run `bun run generate:seo` on its own if you want them during `bun dev`.

## Writing docs

Add an `.mdx` file under `content/docs/` and list it in the sibling `meta.json` to place
it in the sidebar. Frontmatter needs a `title` and `description`; those feed the sidebar
and the page metadata.

**Each page writes its own `# Heading` in the body.** The shared page component does not
render a title from frontmatter, because pages that include a repository markdown file
inherit that file's heading — rendering both would print it twice.

### Pages that mirror repository docs

`architecture.mdx` and `ai-sdk.mdx` hold no content of their own. They pull it from the
repository at build time:

```mdx
<include>../../../architecture.md</include>
```

`docs/architecture.md` and `docs/ai-sdk.md` stay the only copy — they also ship inside the
npm tarball, so a second copy here would drift. Edit those files, not these pages.

Crossing out of `docs/site` works because `next.config.ts` sets Turbopack's `root` to the
repository root. Turbopack resolves nothing outside its root, and would otherwise infer
`docs/site` from the lockfile here.

## The demo slot

The landing page's centerpiece is a slot that takes a media source. No recording exists
yet, so it renders `components/demo-illustration.tsx` — a still panel showing one request
updating two components, labelled as an illustration.

To drop in the recording, put the file in `public/` and pass `src` to `DemoSlot`. The
surrounding layout does not change. Keep the transcript: it is the text equivalent for
readers who cannot perceive the media.

## Deployment

Dokploy builds `Dockerfile` and serves the export with nginx behind Traefik.

**The build context is the repository root, not this directory** — the pages include
markdown from outside `docs/site`.

```bash
docker build -f docs/site/Dockerfile -t nom-docs .
```

The directory-style export needs no rewrite rules, but `nginx.conf` carries three
settings that do earn their place:

- **`absolute_redirect off`** — required, not cosmetic. Traefik terminates TLS and
  forwards plain HTTP, so nginx cannot see the original scheme. With absolute redirects
  it answers `/docs/concepts` with `Location: http://nom.jpndev.xyz/docs/concepts/`,
  downgrading https to http on every extensionless URL. Relative redirects preserve
  whatever the client used.
- **`error_page 404 /404.html`** — serves the site's own 404 instead of nginx's.
- **cache headers on `/_next/static/`** — those filenames are content-hashed.

## Search

Disabled. Fumadocs' search needs a server route a static export cannot emit. Turning it on
means either a hosted search provider or dropping the static export.

On-site search being off is part of why `llms-full.txt` matters: it is the only form of
the documentation an assistant can read in one fetch without executing the site's
JavaScript.
