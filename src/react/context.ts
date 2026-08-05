"use client";

import { createContext } from "react";

import type { AgentComponentController } from "../core/index.js";

/**
 * Shared controller context behind {@link AgentComponentProvider}.
 *
 * Deliberately not re-exported from `src/react/index.ts`: the supported way for
 * application code to read the controller is `useAgentComponentController`, which throws
 * when no provider is mounted. The devtools panel reads this context directly because it
 * must render a diagnostic message instead of throwing inside the application it exists
 * to debug.
 *
 * @internal
 */
export const AgentComponentContext = createContext<AgentComponentController | null>(null);
