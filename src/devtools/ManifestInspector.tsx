"use client";

import { Fragment, useCallback, useSyncExternalStore, type ReactNode } from "react";

import type {
  AgentComponentManifestEntry,
  AgentToolManifest,
  AgentToolApproval,
} from "../core/contracts.js";
import type { AgentComponentController } from "../core/controller.js";
import { describeSchemaFields, formatSchemaJson } from "./schema-view.js";
import { defineDevtoolsTab } from "./tabs.js";

/** Props for the manifest inspector. */
export interface ManifestInspectorProps {
  /** The controller whose registry the view reads. */
  readonly controller: AgentComponentController;
}

/**
 * The manifest view, registered into the shell's tab list.
 *
 * @see AgentDevtoolsTab for the registration contract other views follow.
 */
export const manifestTab = defineDevtoolsTab({
  id: "manifest",
  label: "Manifest",
  render: (context) => <ManifestInspector controller={context.controller} />,
});

/**
 * Shows the live model-facing manifest: every mounted component, its instructions, and each
 * tool's description, approval flag, and generated input JSON Schema.
 *
 * This is what the model is offered right now, read straight from the registry rather than
 * derived, so a component that is missing here was never advertised to the model at all.
 * Read with an empty timeline, that separates "the model never selected this tool" from
 * "the tool ran and failed".
 *
 * Everything here is disclosed to anyone who can open the panel. That is the disclosure a
 * host accepts by mounting the panel, not something this view withholds: instructions and
 * tool descriptions are written for the model, and the panel is a development surface.
 */
export function ManifestInspector({ controller }: ManifestInspectorProps): ReactNode {
  const manifest = useManifest(controller);
  const components = manifest.components;

  if (components.length === 0) {
    return (
      <p className="nom-empty">
        No components are mounted, so the model currently sees no component tools. Render a
        component that calls <code>useAgentComponent</code> to add it to this manifest.
      </p>
    );
  }

  const toolCount = components.reduce((total, component) => total + component.tools.length, 0);

  return (
    <div className="nom-manifest">
      <p className="nom-muted">
        {`The model is currently offered ${countLabel(toolCount, "tool")} across ${countLabel(components.length, "component")}.`}
      </p>
      <ul className="nom-manifest-list" aria-label="Mounted components">
        {components.map((component) => (
          <ComponentEntry key={component.id} component={component} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Reads the registry manifest through `useSyncExternalStore`.
 *
 * The registry caches the manifest and drops that cache only when a registration changes,
 * so repeated reads between changes return the identical frozen object React needs as a
 * stable snapshot. This is the view's own subscription because the manifest is registry
 * state, not pipeline state; the shell's single event subscription carries neither.
 */
function useManifest(controller: AgentComponentController) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => controller.subscribeRegistry(onStoreChange),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getManifest(), [controller]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function ComponentEntry({
  component,
}: {
  readonly component: AgentComponentManifestEntry;
}): ReactNode {
  return (
    <li className="nom-manifest-component">
      <h3 className="nom-manifest-id">{component.id}</h3>
      <dl className="nom-detail-meta">
        <dt>Instructions</dt>
        <dd>{component.instructions}</dd>
      </dl>
      {component.tools.map((tool) => (
        <ToolEntry key={tool.key} componentId={component.id} tool={tool} />
      ))}
    </li>
  );
}

function ToolEntry({
  componentId,
  tool,
}: {
  readonly componentId: string;
  readonly tool: AgentToolManifest;
}): ReactNode {
  return (
    <section className="nom-manifest-tool" aria-label={`Tool: ${componentId} ${tool.key}`}>
      <div className="nom-manifest-tool-header">
        <h4 className="nom-section-title">{tool.key}</h4>
        <ApprovalBadge approval={tool.approval} />
      </div>
      <p className="nom-manifest-description">{tool.description}</p>
      <p className="nom-manifest-schema-title">Input schema</p>
      <SchemaView schema={tool.inputSchema} />
    </section>
  );
}

/**
 * Names the approval flag rather than only marking the required case.
 *
 * Both states are labelled and coloured differently, so a tool the host must approve is
 * never mistaken for one the model may call directly.
 */
function ApprovalBadge({ approval }: { readonly approval: AgentToolApproval }): ReactNode {
  const required = approval === "required";
  return (
    <span
      className={`nom-badge nom-approval nom-approval-${approval}`}
      title={
        required
          ? "The host must approve each call before this tool executes."
          : "The model may call this tool without host approval."
      }
    >
      {required ? "Approval required" : "Approval never"}
    </span>
  );
}

function SchemaView({ schema }: { readonly schema: Readonly<Record<string, unknown>> }): ReactNode {
  const fields = describeSchemaFields(schema);

  return (
    <>
      {fields.length === 0 ? (
        <p className="nom-muted">
          This schema declares no properties, so the model is given no field to fill in.
        </p>
      ) : (
        <dl className="nom-manifest-fields">
          {fields.map((field) => (
            <Fragment key={field.name}>
              <dt>{`${field.name} (${field.required ? "required" : "optional"})`}</dt>
              <dd>
                <span className="nom-manifest-type">{field.type}</span>
                {field.description === undefined ? null : (
                  <span className="nom-muted">{` — ${field.description}`}</span>
                )}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <pre className="nom-payload">{formatSchemaJson(schema)}</pre>
    </>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
