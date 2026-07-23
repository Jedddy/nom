import type { AgentComponentManifest } from "../core/contracts.js";
import { AgentComponentError } from "../core/errors.js";

/** Address-only metadata for one active component tool. */
export interface ActiveAgentTool {
  readonly key: string;
}

/** Address-only metadata for one active component. */
export interface ActiveAgentComponent {
  readonly id: string;
  readonly tools: readonly ActiveAgentTool[];
}

/** Minimal client-to-server manifest containing only active component addresses. */
export interface ActiveAgentManifest {
  readonly version: number;
  readonly components: readonly ActiveAgentComponent[];
}

/** Stable address of one tool on one component instance. */
export interface AIToolAddress {
  readonly componentId: string;
  readonly toolKey: string;
}

/** Bounds applied while converting an untrusted active manifest into tool routes. */
export interface AIToolRoutingLimits {
  /** Maximum active components accepted from a manifest. Defaults to 64. */
  readonly maxComponents?: number;
  /** Maximum total component tools accepted from a manifest. Defaults to 256. */
  readonly maxTools?: number;
  /** Maximum length of each component id and tool key. Defaults to 200. */
  readonly maxAddressLength?: number;
}

const defaultLimits = {
  maxComponents: 64,
  maxTools: 256,
  maxAddressLength: 200,
} as const;

/** Removes descriptions, schemas, policies, and executors from a component manifest. */
export function toActiveAgentManifest(manifest: AgentComponentManifest): ActiveAgentManifest {
  return Object.freeze({
    version: manifest.version,
    components: Object.freeze(
      manifest.components.map((component) =>
        Object.freeze({
          id: component.id,
          tools: Object.freeze(component.tools.map(({ key }) => Object.freeze({ key }))),
        }),
      ),
    ),
  });
}

/** Creates deterministic AI SDK tool-name routes for an active component manifest. */
export function createAIToolRouting(
  manifest: ActiveAgentManifest,
  limits: AIToolRoutingLimits = {},
): ReadonlyMap<string, AIToolAddress> {
  const maxComponents = limits.maxComponents ?? defaultLimits.maxComponents;
  const maxTools = limits.maxTools ?? defaultLimits.maxTools;
  const maxAddressLength = limits.maxAddressLength ?? defaultLimits.maxAddressLength;

  if (manifest.components.length > maxComponents) {
    throw adapterError(`Active manifest exceeds the ${maxComponents} component limit.`);
  }

  const routing = new Map<string, AIToolAddress>();
  const addresses = new Set<string>();
  let toolCount = 0;

  for (const component of manifest.components) {
    assertAddressPart("component id", component.id, maxAddressLength);

    for (const tool of component.tools) {
      assertAddressPart("tool key", tool.key, maxAddressLength);
      toolCount += 1;
      if (toolCount > maxTools) {
        throw adapterError(`Active manifest exceeds the ${maxTools} tool limit.`);
      }

      const addressKey = `${component.id}\u0000${tool.key}`;
      if (addresses.has(addressKey)) {
        throw adapterError(
          `Active manifest contains duplicate address "${component.id}/${tool.key}".`,
        );
      }
      addresses.add(addressKey);

      const name = createAIToolName(component.id, tool.key);
      if (routing.has(name)) {
        throw adapterError(`AI SDK tool name collision for "${name}".`);
      }
      routing.set(name, Object.freeze({ componentId: component.id, toolKey: tool.key }));
    }
  }

  return routing;
}

/** Encodes a component address as a deterministic provider-safe AI SDK tool name. */
export function createAIToolName(componentId: string, toolKey: string): string {
  const address = `${componentId}\u0000${toolKey}`;
  return `nom_${slug(componentId)}_${slug(toolKey)}_${hash(address)}`;
}

function slug(value: string): string {
  return (
    value
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 16) || "tool"
  );
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36).padStart(7, "0");
}

function assertAddressPart(label: string, value: string, maxLength: number): void {
  if (!value || value.length > maxLength) {
    throw adapterError(`Active manifest ${label} must contain 1-${maxLength} characters.`);
  }
}

function adapterError(message: string): AgentComponentError {
  return new AgentComponentError("adapter-failed", message);
}
