"use client";

/**
 * Devtools entry point.
 *
 * Deliberately not re-exported from the package root per KTD7: only an explicit
 * `@nom-ai/sdk/devtools` import pulls the panel and its styles into an application bundle.
 *
 * Every re-export below is a whole-module `export *`, matching the other package barrels.
 * Naming symbols individually (`export { describePayload } from "./payload.js"`) miscompiles
 * under Bun's bundler when the source module is also reachable through one of the other
 * barrels: the packed entry emits `describePayload2 as describePayload` without ever declaring
 * that name, so importing the subpath fails to load. The devtools consumer smoke in
 * `scripts/test-consumer.ts` imports the packed subpath, which is what catches a regression.
 * These three modules export exactly the symbols this entry means to publish, so widening to
 * `export *` costs no extra surface.
 */

export * from "./AgentDevtools.js";
export * from "./ManifestInspector.js";
export * from "./MockFire.js";
export * from "./RequestDetail.js";
export * from "./Timeline.js";
export * from "./payload.js";
export * from "./requests.js";
export * from "./shadow-root.js";
export * from "./tabs.js";
