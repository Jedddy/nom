import { rm } from "node:fs/promises";

const entrypoints = [
  "src/index.ts",
  "src/core/index.ts",
  "src/react/index.ts",
  "src/ai-sdk/index.ts",
];

await rm("dist", { recursive: true, force: true });

const build = await Bun.build({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  entrypoints,
  format: "esm",
  naming: "[dir]/[name].js",
  outdir: "dist",
  packages: "external",
  root: "src",
  sourcemap: "external",
  target: "browser",
});

if (!build.success) {
  for (const log of build.logs) {
    console.error(log);
  }

  process.exit(1);
}
