"use client";

import { createContext, useContext, type ReactNode } from "react";

import { AgentComponentController } from "../core/index.js";

const AgentComponentContext = createContext<AgentComponentController | null>(null);

/** Props for the provider that shares a controller with agent-addressable components. */
export interface AgentComponentProviderProps {
  /** The host-owned controller used by descendants. */
  readonly controller: AgentComponentController;
  /** React content that may register or consume agent components. */
  readonly children: ReactNode;
}

/** Makes one {@link AgentComponentController} available to descendant bindings. */
export function AgentComponentProvider({
  controller,
  children,
}: AgentComponentProviderProps): ReactNode {
  return (
    <AgentComponentContext.Provider value={controller}>{children}</AgentComponentContext.Provider>
  );
}

/** Returns the nearest agent component controller or throws when no provider is mounted. */
export function useAgentComponentController(): AgentComponentController {
  const controller = useContext(AgentComponentContext);
  if (!controller) {
    throw new Error("Agent components must be rendered inside AgentComponentProvider.");
  }
  return controller;
}
