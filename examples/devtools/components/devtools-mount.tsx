"use client";

import dynamic from "next/dynamic";

const DevtoolsPanel = dynamic(() => import("./devtools-panel"), { ssr: false });

/**
 * Mounts the panel once, only in a build that enabled devtools.
 *
 * Two independent gates, and both matter:
 *
 * - This flag decides whether the panel's chunk is ever requested.
 * - `createAgentController` decides what the panel is allowed to see and do. Mounting the
 *   panel grants nothing on its own; a controller built without `devtools` options shows a
 *   panel that reports it has nothing to display.
 */
export function DevtoolsMount() {
  if (process.env.NEXT_PUBLIC_AGENT_DEVTOOLS !== "on") {
    return null;
  }
  return <DevtoolsPanel />;
}
