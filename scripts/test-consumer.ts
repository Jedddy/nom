import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "nom-consumer-"));
const packageJSON = await Bun.file(resolve(projectRoot, "package.json")).json();
const archiveName = `${String(packageJSON.name).replace(/^@/, "").replace("/", "-")}-${packageJSON.version}.tgz`;
const archive = join(temporaryRoot, archiveName);
const bun = findBun();

try {
  await run([bun, "pm", "pack", "--destination", temporaryRoot], projectRoot);

  const packageReference = `file:${archive.replaceAll("\\", "/")}`;
  await verifyCoreOnlyConsumer(packageReference);
  await verifyReactConsumer(packageReference);
  console.log("Packed consumer checks passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function verifyCoreOnlyConsumer(packageReference: string): Promise<void> {
  const consumerRoot = join(temporaryRoot, "core-only");
  await mkdir(consumerRoot);
  await writeJSON(join(consumerRoot, "package.json"), {
    private: true,
    type: "module",
    dependencies: { "@nom-ai/sdk": packageReference },
  });
  await copyFile(
    resolve(projectRoot, "tests/consumer/core-entry.mjs"),
    join(consumerRoot, "entry.mjs"),
  );
  await run([bun, "install", "--ignore-scripts"], consumerRoot);
  await run([bun, "--no-install", "entry.mjs"], consumerRoot);
}

async function verifyReactConsumer(packageReference: string): Promise<void> {
  const consumerRoot = join(temporaryRoot, "react");
  const reactVersion = getReactVersion();
  await mkdir(consumerRoot);
  await writeJSON(join(consumerRoot, "package.json"), {
    private: true,
    type: "module",
    dependencies: {
      "@nom-ai/sdk": packageReference,
      react: reactVersion,
      "react-dom": reactVersion,
    },
    devDependencies: {
      "@types/react": reactVersion.startsWith("18") ? "^18.3.0" : "^19.2.0",
      "@types/react-dom": reactVersion.startsWith("18") ? "^18.3.0" : "^19.2.0",
    },
  });
  await copyFile(resolve(projectRoot, "tests/consumer/entry.tsx"), join(consumerRoot, "entry.tsx"));
  await writeJSON(join(consumerRoot, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["entry.tsx"],
  });
  await run([bun, "install", "--ignore-scripts"], consumerRoot);
  await run(
    [bun, resolve(projectRoot, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
    consumerRoot,
  );
  await run([bun, "--no-install", "entry.tsx"], consumerRoot);
}

async function writeJSON(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed in ${cwd}:\n${stderr || stdout}`);
  }
}

function findBun(): string {
  const executable = Bun.which("bun");
  if (!executable) {
    throw new Error("The Bun executable is unavailable.");
  }
  return executable;
}

function getReactVersion(): string {
  const argumentsAfterScript = process.argv.slice(2);
  const flagIndex = argumentsAfterScript.indexOf("--react");
  if (flagIndex >= 0) {
    const version = argumentsAfterScript[flagIndex + 1];
    if (!version) {
      throw new Error("--react requires a version.");
    }
    return version;
  }

  return argumentsAfterScript[0] ?? process.env.REACT_VERSION ?? "19.2.8";
}
