import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site ships as a static bundle so any static host can serve it.
  output: "export",

  // Emit /docs/concepts/index.html rather than /docs/concepts.html. Directory-style
  // output is what every static server resolves correctly out of the box, so the
  // container needs no rewrite rules.
  trailingSlash: true,

  // Turbopack only resolves files inside its root, and it infers that root from the
  // nearest lockfile — which is docs/site/bun.lock. The docs pages pull markdown from
  // the repository root, so the root has to span the whole repo.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
