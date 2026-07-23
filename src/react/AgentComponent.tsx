"use client";

import { useMemo, type ReactNode } from "react";

import type { AgentComponentRegistration } from "../core/contracts.js";
import type { AgentComponentSnapshot } from "../core/state.js";
import { useAgentComponent } from "./useAgentComponent.js";

/** Props for the render-prop component that registers one agent-addressable component. */
export interface AgentComponentProps<TProps> extends AgentComponentRegistration<TProps> {
  /** Renders application-owned UI from the current component lifecycle snapshot. */
  readonly children: (snapshot: AgentComponentSnapshot<TProps>) => ReactNode;
}

/**
 * Registers a component capability and renders its lifecycle through a render prop.
 *
 * The application remains responsible for loading, empty, failure, and success UI.
 */
export function AgentComponent<TProps>({
  id,
  instructions,
  tools,
  children,
}: AgentComponentProps<TProps>): ReactNode {
  const registration = useMemo<AgentComponentRegistration<TProps>>(
    () => ({ id, instructions, tools }),
    [id, instructions, tools],
  );
  return children(useAgentComponent(registration));
}
