import { existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const bun = Bun.which("bun");
if (!bun) {
  throw new Error("The Bun executable is unavailable.");
}
const process = Bun.spawn([bun, "pm", "pack", "--dry-run"], {
  cwd: projectRoot,
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(process.stdout).text(),
  new Response(process.stderr).text(),
  process.exited,
]);

if (exitCode !== 0) {
  throw new Error(`bun pm pack --dry-run failed:\n${stderr || stdout}`);
}

const packedFiles = stdout
  .split(/\r?\n/)
  .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
  .filter((file): file is string => Boolean(file));

const requiredStaticFiles = new Set([
  "package.json",
  "README.md",
  "LICENSE",
  "docs/architecture.md",
  "docs/ai-sdk.md",
]);
const requiredFiles = [
  ...requiredStaticFiles,
  "dist/index.js",
  "dist/index.d.ts",
  "dist/core/index.js",
  "dist/core/index.d.ts",
  "dist/react/index.js",
  "dist/react/index.d.ts",
  "dist/ai-sdk/index.js",
  "dist/ai-sdk/index.d.ts",
];

for (const file of requiredFiles) {
  if (!packedFiles.includes(file)) {
    throw new Error(`Packed artifact is missing "${file}".`);
  }
}

const reactEntrypoints = ["dist/index.js", "dist/react/index.js"];
for (const file of reactEntrypoints) {
  const source = await Bun.file(resolve(projectRoot, file)).text();
  if (source.includes("react/jsx-dev-runtime") || source.includes("jsxDEV")) {
    throw new Error(`Packed artifact "${file}" contains the React development JSX runtime.`);
  }
  if (!source.includes("react/jsx-runtime")) {
    throw new Error(`Packed artifact "${file}" is missing the React production JSX runtime.`);
  }
}

const unexpectedFiles = packedFiles.filter(
  (file) => !requiredStaticFiles.has(file) && !file.startsWith("dist/"),
);
if (unexpectedFiles.length > 0) {
  throw new Error(`Packed artifact contains unexpected files: ${unexpectedFiles.join(", ")}`);
}

const packageJSON = await Bun.file(resolve(projectRoot, "package.json")).json();
for (const [subpath, target] of Object.entries(packageJSON.exports as PackageExports)) {
  if (subpath === "./package.json") {
    continue;
  }
  for (const path of Object.values(target)) {
    if (!existsSync(resolve(projectRoot, path))) {
      throw new Error(`Package export "${subpath}" points to missing file "${path}".`);
    }
  }
}

console.log(`Package check passed with ${packedFiles.length} files.`);

type PackageExports = Record<string, string | Record<string, string>>;
