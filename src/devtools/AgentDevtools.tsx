"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { AgentComponentController, AgentDevtoolsSettings } from "../core/controller.js";
import type { AgentPipelineEvent } from "../core/events.js";
import { AgentComponentContext } from "../react/context.js";
import { manifestTab } from "./ManifestInspector.js";
import { mockFireTab } from "./MockFire.js";
import { buildRequestTimeline, type AgentRequestEntry } from "./requests.js";
import { createDevtoolsShadowHost } from "./shadow-root.js";
import { DEFAULT_DRAWER_HEIGHT, MIN_DRAWER_HEIGHT } from "./styles.js";
import { timelineTab } from "./Timeline.js";
import type { AgentDevtoolsTab, AgentDevtoolsTabContext } from "./tabs.js";

/**
 * Views the shell renders, in tab order, with Timeline first as the default tab.
 *
 * This array is the registration point for built-in views: a new view exports an
 * {@link AgentDevtoolsTab} descriptor from its own module and is appended here. Nothing
 * else in the shell changes — tab selection, focus order, and chrome are shell-owned.
 */
const BUILT_IN_TABS: readonly AgentDevtoolsTab[] = [timelineTab, manifestTab, mockFireTab];

const NO_EVENTS: readonly AgentPipelineEvent[] = Object.freeze([]);
const HEIGHT_STEP = 32;

/** Props for the devtools panel. */
export interface AgentDevtoolsProps {
  /**
   * Host-supplied views, appended after the built-in tabs.
   *
   * Same descriptor contract as the built-ins; see {@link AgentDevtoolsTab}.
   */
  readonly additionalTabs?: readonly AgentDevtoolsTab[];
}

/**
 * The devtools panel: a collapsed launcher that opens a bottom-docked inspector drawer.
 *
 * Mount it once anywhere inside `AgentComponentProvider`; it discovers every registered
 * component through the controller it resolves from context, with no per-component wiring.
 * It renders into a shadow root on a document-level container per KTD6, so it neither
 * ships a stylesheet nor inherits host styles, and it renders nothing at all during server
 * rendering.
 *
 * Mounting the panel grants no capability. Which payload mode is active and whether
 * mock-fire is available are fixed by the controller's constructor options; the panel only
 * reports them.
 */
export function AgentDevtools({ additionalTabs }: AgentDevtoolsProps = {}): ReactNode {
  const controller = useContext(AgentComponentContext);
  const events = useControllerEvents(controller);
  const root = useDevtoolsShadowRoot();

  const tabs = useMemo(
    () =>
      additionalTabs === undefined || additionalTabs.length === 0
        ? BUILT_IN_TABS
        : [...BUILT_IN_TABS, ...additionalTabs],
    [additionalTabs],
  );

  if (root === null) {
    return null;
  }

  return createPortal(<DevtoolsShell controller={controller} events={events} tabs={tabs} />, root);
}

/**
 * Reads the controller's retained events through `useSyncExternalStore`.
 *
 * Both halves are required: the subscription reports that something changed, and the read
 * accessor supplies the referentially stable snapshot React compares. Subscribing without
 * the accessor would hand React a fresh array on every render and loop.
 */
function useControllerEvents(
  controller: AgentComponentController | null,
): readonly AgentPipelineEvent[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      controller === null
        ? noop
        : controller.subscribeEvents(() => {
            onStoreChange();
          }),
    [controller],
  );
  const getSnapshot = useCallback(
    () => (controller === null ? NO_EVENTS : controller.getEvents()),
    [controller],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerEvents);
}

function getServerEvents(): readonly AgentPipelineEvent[] {
  return NO_EVENTS;
}

function noop(): void {
  // No controller to unsubscribe from.
}

/**
 * Creates the shadow-root container in an effect, so server rendering never touches `document`.
 *
 * The panel renders nothing until the root exists, which also keeps the first client render
 * identical to the empty server output.
 */
function useDevtoolsShadowRoot(): ShadowRoot | null {
  const [root, setRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const host = createDevtoolsShadowHost(document);
    if (host === null) {
      return;
    }

    setRoot(host.root);
    return () => {
      setRoot(null);
      host.dispose();
    };
  }, []);

  return root;
}

interface DevtoolsShellProps {
  readonly controller: AgentComponentController | null;
  readonly events: readonly AgentPipelineEvent[];
  readonly tabs: readonly AgentDevtoolsTab[];
}

function DevtoolsShell({ controller, events, tabs }: DevtoolsShellProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const settings = useMemo(() => controller?.getDevtoolsSettings() ?? null, [controller]);
  const requests = useMemo(() => buildRequestTimeline(events), [events]);
  const failureCount = requests.filter((request) => request.outcome === "failed").length;

  const collapse = useCallback(() => {
    setExpanded(false);
    launcherRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && expanded) {
        event.stopPropagation();
        collapse();
      }
    },
    [collapse, expanded],
  );

  return (
    <div className="nom-devtools" onKeyDown={handleKeyDown}>
      <button
        ref={launcherRef}
        type="button"
        className="nom-launcher"
        aria-expanded={expanded}
        aria-controls={PANEL_ID}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>Agent devtools</span>
        <span className="nom-launcher-count">
          {`${requests.length} ${requests.length === 1 ? "request" : "requests"}`}
        </span>
        {failureCount > 0 ? (
          <span className="nom-launcher-failures">{`${failureCount} failed`}</span>
        ) : null}
      </button>
      {expanded ? (
        <DevtoolsDrawer
          controller={controller}
          settings={settings}
          events={events}
          requests={requests}
          tabs={tabs}
          onClose={collapse}
        />
      ) : null}
    </div>
  );
}

const PANEL_ID = "nom-devtools-panel";

interface DevtoolsDrawerProps {
  readonly controller: AgentComponentController | null;
  readonly settings: AgentDevtoolsSettings | null;
  readonly events: readonly AgentPipelineEvent[];
  readonly requests: readonly AgentRequestEntry[];
  readonly tabs: readonly AgentDevtoolsTab[];
  readonly onClose: () => void;
}

function DevtoolsDrawer({
  controller,
  settings,
  events,
  requests,
  tabs,
  onClose,
}: DevtoolsDrawerProps): ReactNode {
  // Null means "whichever tab comes first", so the default view follows the available set
  // rather than a snapshot of it taken when the drawer opened.
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const selectRequest = useCallback((requestId: string | null) => {
    setSelectedRequestId(requestId);
    if (requestId !== null) {
      setActiveTabId(timelineTab.id);
    }
  }, []);

  const context = useMemo<AgentDevtoolsTabContext | null>(
    () =>
      controller === null || settings === null
        ? null
        : { controller, settings, events, requests, selectedRequestId, selectRequest },
    [controller, settings, events, requests, selectedRequestId, selectRequest],
  );

  // Without a controller there are no settings to gate on, so a capability-gated tab is
  // withheld rather than assumed available: R16 requires the absent case to be the default.
  const available = useMemo(
    () =>
      tabs.filter((tab) =>
        tab.isAvailable === undefined ? true : context !== null && tab.isAvailable(context),
      ),
    [context, tabs],
  );

  const activeTab = available.find((tab) => tab.id === activeTabId) ?? available[0];
  const firstTabRef = useRef<HTMLButtonElement | null>(null);
  const [height, setHeight] = useState(DEFAULT_DRAWER_HEIGHT);

  // Expanding moves focus to the panel's first control. The drawer only exists while the
  // panel is open, so this never steals focus on mount of a collapsed panel, and nothing
  // here traps focus once it lands.
  useEffect(() => {
    firstTabRef.current?.focus();
  }, []);

  const resize = useCallback((next: number) => {
    setHeight(clampHeight(next));
  }, []);

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHeight((current) => clampHeight(current + HEIGHT_STEP));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHeight((current) => clampHeight(current - HEIGHT_STEP));
    }
  }, []);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const view = event.currentTarget.ownerDocument.defaultView;
      if (view === null) {
        return;
      }

      const startY = event.clientY;
      const startHeight = height;
      const handleMove = (move: PointerEvent) => resize(startHeight + (startY - move.clientY));
      const handleUp = () => {
        view.removeEventListener("pointermove", handleMove);
        view.removeEventListener("pointerup", handleUp);
      };

      view.addEventListener("pointermove", handleMove);
      view.addEventListener("pointerup", handleUp);
    },
    [height, resize],
  );

  return (
    <section
      id={PANEL_ID}
      className="nom-drawer"
      style={{ height: `${height}px` }}
      aria-label="Agent devtools panel"
    >
      <div
        className="nom-resize"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize agent devtools panel"
        aria-valuenow={height}
        aria-valuemin={MIN_DRAWER_HEIGHT}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />
      <header className="nom-header">
        <h2 className="nom-title">Agent devtools</h2>
        {settings === null ? null : <PayloadModeIndicator settings={settings} />}
        <button type="button" className="nom-close" onClick={onClose}>
          Close agent devtools
        </button>
      </header>
      <div className="nom-tablist" role="tablist" aria-label="Agent devtools views">
        {available.map((tab, index) => (
          <button
            key={tab.id}
            ref={index === 0 ? firstTabRef : undefined}
            type="button"
            role="tab"
            id={`nom-devtools-tab-${tab.id}`}
            className="nom-tab"
            aria-selected={tab.id === activeTab?.id}
            aria-controls={`nom-devtools-tabpanel-${tab.id}`}
            tabIndex={tab.id === activeTab?.id ? 0 : -1}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="nom-tabpanel"
        role="tabpanel"
        id={`nom-devtools-tabpanel-${activeTab?.id ?? timelineTab.id}`}
        aria-labelledby={`nom-devtools-tab-${activeTab?.id ?? timelineTab.id}`}
      >
        {context === null ? <MissingProviderNotice /> : (activeTab?.render(context) ?? null)}
      </div>
    </section>
  );
}

function PayloadModeIndicator({
  settings,
}: {
  readonly settings: AgentDevtoolsSettings;
}): ReactNode {
  const verbatim = settings.payloadMode === "verbatim";
  return (
    <span
      className={`nom-payload-mode ${verbatim ? "nom-payload-mode-verbatim" : ""}`}
      title={
        verbatim
          ? "This controller was constructed with verbatim payloads, so events carry raw host values."
          : "Events carry structural summaries only, so an absent value is withheld rather than missing."
      }
    >
      {`Payload values: ${verbatim ? "verbatim" : "summarized"}`}
    </span>
  );
}

function MissingProviderNotice(): ReactNode {
  return (
    <p className="nom-empty">
      No AgentComponentProvider was found above this panel. Render{" "}
      <code>{"<AgentDevtools />"}</code> inside <code>AgentComponentProvider</code> so it can
      resolve the controller to inspect.
    </p>
  );
}

function clampHeight(value: number): number {
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  const maximum = Math.max(MIN_DRAWER_HEIGHT, Math.round(viewportHeight * 0.9) || 720);
  return Math.min(maximum, Math.max(MIN_DRAWER_HEIGHT, Math.round(value)));
}
