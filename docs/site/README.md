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
components/                    landing-page components
content/docs/                  the documentation itself (MDX)
lib/
  source.ts                    content loader
  layout.shared.ts             nav options shared by both layouts
source.config.ts               Fumadocs collection definition
```

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
