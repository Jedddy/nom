import type { ReactNode } from "react";

import type { AgentComponentController, AgentDevtoolsSettings } from "../core/controller.js";
import type { AgentPipelineEvent } from "../core/events.js";
import type { AgentRequestEntry } from "./requests.js";

/**
 * Everything the shell has already resolved, handed to each tab when it renders.
 *
 * A tab must not re-derive any of this. The shell owns the single subscription to the
 * controller's event stream and the single grouping pass over it; a tab that subscribed
 * again would double the work on every event and could disagree with the timeline about
 * what the current snapshot is.
 */
export interface AgentDevtoolsTabContext {
  /** The controller resolved from provider context. Never `null` while a tab renders. */
  readonly controller: AgentComponentController;
  /** The controller's fixed devtools capabilities, including the active payload mode. */
  readonly settings: AgentDevtoolsSettings;
  /** The retained event history, in record order. */
  readonly events: readonly AgentPipelineEvent[];
  /** The same events grouped into one entry per request, in chronological order. */
  readonly requests: readonly AgentRequestEntry[];
  /** The request the panel currently has selected, or `null` when none is. */
  readonly selectedRequestId: string | null;
  /**
   * Selects a request, moving the panel to the view that shows it; `null` clears it.
   *
   * The shell owns both the selection and which tab is active, so a tab that produces a
   * request — mock-fire is the only one — hands the id here rather than reporting the
   * result itself. That keeps one account of what a request did: the timeline entry.
   */
  readonly selectRequest: (requestId: string | null) => void;
}

/**
 * One view registered into the panel shell.
 *
 * This is the extension contract for the panel: a view is a plain descriptor, so adding a
 * view never restructures the shell. To add a built-in view, export a descriptor from the
 * view's own module and append it to `BUILT_IN_TABS` in `AgentDevtools.tsx` — that array
 * is the registration point, and nothing else in the shell needs to change. A host can
 * add a view of its own through the `additionalTabs` prop, which is appended after the
 * built-ins.
 *
 * The shell owns tab selection, focus order, and the surrounding chrome; a tab renders
 * only its own body and must not render chrome, a tablist, or the payload-mode indicator.
 */
export interface AgentDevtoolsTab {
  /** Stable identifier, used for the tab and tab panel element ids. */
  readonly id: string;
  /** Label shown in the tablist and used as the tab's accessible name. */
  readonly label: string;
  /**
   * Hides the tab entirely when it returns `false`.
   *
   * A capability-gated view uses this rather than rendering a disabled tab: R16 requires
   * the mock-fire control to be absent, not merely inert, when it is not enabled.
   */
  readonly isAvailable?: (context: AgentDevtoolsTabContext) => boolean;
  /** Renders the tab body. Called only while this tab is the active one. */
  readonly render: (context: AgentDevtoolsTabContext) => ReactNode;
}

/** Identity helper that types a tab descriptor at its definition site. */
export function defineDevtoolsTab(tab: AgentDevtoolsTab): AgentDevtoolsTab {
  return tab;
}
