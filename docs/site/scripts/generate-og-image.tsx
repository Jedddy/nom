/**
 * Renders the Open Graph card to `public/og.png` before `next build` runs.
 *
 * Next.js can produce this from an `app/opengraph-image.tsx` metadata route, but under
 * `output: export` that route lands in the export as an extensionless file named
 * `opengraph-image`. A static server has no way to know it is a PNG and serves it as
 * `application/octet-stream`, which every link unfurler rejects. Writing a real
 * `public/og.png` sidesteps the whole problem and works on any host.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { OgCard, ogSize } from "../components/og-card";

const outputPath = path.join(import.meta.dirname, "..", "public", "og.png");

const image = new ImageResponse(
  (
    <OgCard
      eyebrow="@nom-ai/sdk"
      title="Connect AI tool calls to React component props."
      description="An agent loads data into components already in your application."
    />
  ),
  ogSize,
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(await image.arrayBuffer()));

console.log(`[seo] wrote ${path.relative(process.cwd(), outputPath)}`);
