"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import type { AgentComponentManifest } from "../core/contracts.js";
import type { AgentComponentController } from "../core/controller.js";
import { AgentComponentError } from "../core/errors.js";
import { defineDevtoolsTab } from "./tabs.js";

/** Props for the mock-fire control. */
export interface MockFireProps {
  /** The controller the mock output is applied to. */
  readonly controller: AgentComponentController;
  /**
   * Hands the panel the request the apply produced, so the timeline reports the outcome.
   *
   * Called for every apply that reached the pipeline, including one the pipeline rejected:
   * the timeline entry is the report, and this view never restates it.
   */
  readonly onApplied: (requestId: string) => void;
}

/**
 * The mock-fire view, registered into the shell's tab list.
 *
 * `isAvailable` is what satisfies R16: with mock-fire off the tab is never built, so the
 * panel offers no control to apply an output rather than an inert one. Mounting the panel
 * cannot turn this on — the flag is fixed on the controller's constructor.
 *
 * @see AgentDevtoolsTab for the registration contract other views follow.
 */
export const mockFireTab = defineDevtoolsTab({
  id: "mock-fire",
  label: "Mock fire",
  isAvailable: (context) => context.settings.mockFire,
  render: (context) => (
    <MockFire controller={context.controller} onApplied={context.selectRequest} />
  ),
});

/**
 * Applies a developer-supplied output to a mounted component through the real pipeline.
 *
 * The entered text goes to `applyOutput`, the same path an external executor uses, so
 * output validation, mapping, and the published snapshot are identical to a real call.
 * Nothing here short-circuits a rejection: an output the tool's schema refuses puts the
 * component into its failure state exactly as a real call with that payload would, and the
 * timeline reports where it was rejected.
 *
 * Only two problems are reported here, because neither ever reaches the controller: text
 * that is not JSON, and a target that is no longer registered. Both keep the entered text
 * so it can be corrected rather than retyped.
 */
export function MockFire({ controller, onApplied }: MockFireProps): ReactNode {
  const manifest = useManifest(controller);
  const [componentId, setComponentId] = useState("");
  const [toolKey, setToolKey] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const componentIds = useMemo(
    () =>
      withSelected(
        manifest.components.map((component) => component.id),
        componentId,
      ),
    [manifest, componentId],
  );
  const toolKeys = useMemo(() => {
    const selected = manifest.components.find((component) => component.id === componentId);
    return withSelected(selected?.tools.map((tool) => tool.key) ?? [], toolKey);
  }, [manifest, componentId, toolKey]);

  const chooseComponent = useCallback((nextId: string) => {
    setComponentId(nextId);
    // Tool keys are scoped to a component, so a key chosen for the previous one is not a
    // selection for this one and must be made again.
    setToolKey("");
    setError(null);
  }, []);

  const apply = useCallback(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch (cause) {
      setError(`The mock output is not valid JSON, so nothing was applied: ${reason(cause)}`);
      return;
    }

    setError(null);
    setPending(true);
    const requestId = nextRequestId();
    const outcome = await applyMockOutput(controller, {
      componentId,
      toolKey,
      output: parsed,
      requestId,
    });
    setPending(false);

    if (outcome.status === "unavailable") {
      setError(outcome.message);
      return;
    }

    onApplied(requestId);
  }, [componentId, controller, onApplied, output, toolKey]);

  if (manifest.components.length === 0 && componentId === "") {
    return (
      <p className="nom-empty">
        No components are mounted, so there is nothing to apply a mock output to. Render a component
        that calls <code>useAgentComponent</code> first.
      </p>
    );
  }

  const ready = componentId !== "" && toolKey !== "";

  return (
    <div className="nom-mock">
      <p className="nom-muted">
        The output is applied through the same path an external executor uses, so it is validated
        and mapped exactly as a real call would be.
      </p>
      <div className="nom-mock-targets">
        <div className="nom-mock-field">
          <label className="nom-mock-label" htmlFor={COMPONENT_FIELD_ID}>
            Component
          </label>
          <select
            id={COMPONENT_FIELD_ID}
            className="nom-mock-select"
            aria-label="Component"
            value={componentId}
            onChange={(event) => chooseComponent(event.target.value)}
          >
            <option value="">Select a component</option>
            {componentIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <div className="nom-mock-field">
          <label className="nom-mock-label" htmlFor={TOOL_FIELD_ID}>
            Tool
          </label>
          <select
            id={TOOL_FIELD_ID}
            className="nom-mock-select"
            aria-label="Tool"
            value={toolKey}
            disabled={componentId === ""}
            onChange={(event) => {
              setToolKey(event.target.value);
              setError(null);
            }}
          >
            <option value="">Select a tool</option>
            {toolKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="nom-mock-field">
        <label className="nom-mock-label" htmlFor={OUTPUT_FIELD_ID}>
          Mock output (JSON)
        </label>
        <textarea
          id={OUTPUT_FIELD_ID}
          className="nom-mock-output"
          aria-label="Mock output (JSON)"
          aria-describedby={error === null ? undefined : ERROR_ID}
          aria-invalid={error === null ? undefined : true}
          rows={6}
          spellCheck={false}
          value={output}
          placeholder="The output value this tool would return, as JSON."
          onChange={(event) => setOutput(event.target.value)}
        />
        {error === null ? null : (
          <p id={ERROR_ID} className="nom-mock-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="nom-mock-actions">
        <button
          type="button"
          className="nom-mock-apply"
          disabled={!ready || pending}
          title={
            ready
              ? "Apply this output to the selected component."
              : "Choose a component and a tool first."
          }
          onClick={() => {
            void apply();
          }}
        >
          {pending ? "Applying…" : "Apply mock output"}
        </button>
      </div>
    </div>
  );
}

const COMPONENT_FIELD_ID = "nom-mock-component";
const TOOL_FIELD_ID = "nom-mock-tool";
const OUTPUT_FIELD_ID = "nom-mock-output";
const ERROR_ID = "nom-mock-error";

/** Failure codes `applyOutput` raises before it starts a request, so nothing is recorded. */
const UNSTARTED_CODES: ReadonlySet<string> = new Set([
  "registration-unavailable",
  "tool-unavailable",
]);

type MockFireOutcome =
  { readonly status: "recorded" } | { readonly status: "unavailable"; readonly message: string };

/**
 * Applies the output and classifies what came back into the only distinction this view makes.
 *
 * A rejection from validation or mapping is *not* an error to report here: the controller
 * already published the component's failure state and recorded the rejection, so returning
 * `recorded` sends the developer to that timeline entry. Only a target the controller could
 * not resolve leaves no trace, and that is the one rejection reported inline.
 */
async function applyMockOutput(
  controller: AgentComponentController,
  request: {
    readonly componentId: string;
    readonly toolKey: string;
    readonly output: unknown;
    readonly requestId: string;
  },
): Promise<MockFireOutcome> {
  try {
    await controller.applyOutput(request);
    return { status: "recorded" };
  } catch (cause) {
    if (cause instanceof AgentComponentError && UNSTARTED_CODES.has(cause.code)) {
      return {
        status: "unavailable",
        message: `${cause.message} Nothing was applied, so no request was recorded.`,
      };
    }

    return { status: "recorded" };
  }
}

/**
 * Reads the registry manifest through `useSyncExternalStore`.
 *
 * The registry caches the manifest between changes, so repeated reads return the identical
 * frozen object React needs as a stable snapshot. This view subscribes to registry state
 * itself because the shell's single subscription carries pipeline events, not registrations.
 */
function useManifest(controller: AgentComponentController): AgentComponentManifest {
  const subscribe = useCallback(
    (onStoreChange: () => void) => controller.subscribeRegistry(onStoreChange),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getManifest(), [controller]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Keeps a chosen value selectable after it leaves the manifest.
 *
 * A component can unregister between the choice and the apply. Dropping it from the list
 * would silently reset the selection; keeping it lets the apply run and report that the
 * target is gone, which is the honest answer to what the developer asked for.
 */
function withSelected(values: readonly string[], selected: string): readonly string[] {
  return selected === "" || values.includes(selected) ? values : [...values, selected];
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

let requestSequence = 0;

function nextRequestId(): string {
  requestSequence += 1;
  return `mock-fire:${requestSequence}`;
}
