import type { StandardJSONSchemaV1, StandardSchemaV1 } from "@standard-schema/spec";

/** A model-input schema that supports runtime validation and JSON Schema generation. */
export type AgentInputSchema<T> = StandardSchemaV1<unknown, T> & StandardJSONSchemaV1<unknown, T>;

/** A runtime schema for validating data returned by a tool executor. */
export type AgentOutputSchema<T> = StandardSchemaV1<unknown, T>;

/** Controls whether the host must approve a tool call before it executes. */
export type AgentToolApproval = "never" | "required";

/** A JSON-serializable value that can be deliberately returned to a model. */
export type AgentJSONValue =
  | null
  | boolean
  | number
  | string
  | readonly AgentJSONValue[]
  | { readonly [key: string]: AgentJSONValue };

/** A text or JSON result projected into model conversation history. */
export type AgentModelOutput =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "json"; readonly value: AgentJSONValue };

/** Execution metadata supplied to tool executors and output mappers. */
export interface AgentToolContext {
  /** The stable id of the component targeted by the request. */
  readonly componentId: string;
  /** The request identity used for lifecycle and replay handling. */
  readonly requestId: string;
  /** Aborts when the request is cancelled, superseded, or unregistered. */
  readonly signal: AbortSignal;
}

/** The render outcome produced after validated tool output is mapped to component props. */
export type AgentComponentResult<TProps> =
  { readonly status: "success"; readonly props: TProps } | { readonly status: "empty" };

/** A validated capability that can load and map data for one component. */
export interface AgentComponentTool<TInput, TOutput, TProps> {
  /** A stable key that is unique within the component registration. */
  readonly key: string;
  /** A model-facing explanation of when and how to use the tool. */
  readonly description: string;
  /** Validates model input and supplies its JSON Schema. */
  readonly inputSchema: AgentInputSchema<TInput>;
  /** Validates executor or server output before mapping. */
  readonly outputSchema: AgentOutputSchema<TOutput>;
  /** Whether the host must explicitly approve execution. */
  readonly approval: AgentToolApproval;
  /** Runs the tool when execution is local to this registration. */
  execute?(input: TInput, context: AgentToolContext): TOutput | Promise<TOutput>;
  /** Converts validated output into props or an explicit empty state. */
  mapOutput(
    output: TOutput,
    context: AgentToolContext,
  ): AgentComponentResult<TProps> | Promise<AgentComponentResult<TProps>>;
  /** Selects the minimal result, if any, that should be returned to the model. */
  projectModelOutput?(
    output: TOutput,
    context: AgentToolContext,
  ): AgentModelOutput | Promise<AgentModelOutput>;
}

/** Configuration accepted by {@link defineAgentTool}; approval defaults to `"never"`. */
export type AgentComponentToolDefinition<TInput, TOutput, TProps> = Omit<
  AgentComponentTool<TInput, TOutput, TProps>,
  "approval"
> & {
  readonly approval?: AgentToolApproval;
};

/** Describes one mounted component instance and the tools that may update it. */
export interface AgentComponentRegistration<TProps = unknown> {
  /** A stable id that is unique among currently mounted components. */
  readonly id: string;
  /** Model-facing guidance for choosing this component. */
  readonly instructions: string;
  /** The validated capabilities exposed by this component. */
  readonly tools: readonly AgentComponentTool<unknown, unknown, TProps>[];
}

/** Serializable metadata for one registered component tool. */
export interface AgentToolManifest {
  readonly key: string;
  readonly description: string;
  readonly approval: AgentToolApproval;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** Serializable metadata for one registered component. */
export interface AgentComponentManifestEntry {
  readonly id: string;
  readonly instructions: string;
  readonly tools: readonly AgentToolManifest[];
}

/** Immutable snapshot of every component capability currently registered with a controller. */
export interface AgentComponentManifest {
  readonly version: number;
  readonly components: readonly AgentComponentManifestEntry[];
}

/** Owns the lifetime of a component registration. */
export interface AgentComponentRegistrationHandle<TProps> {
  /** Replaces instructions and tools without changing the registered component id. */
  update(registration: AgentComponentRegistration<TProps>): void;
  /** Removes the registration; returns `false` when it no longer owns that id. */
  unregister(): boolean;
}

/**
 * Defines an immutable component tool while preserving input, output, and prop inference.
 *
 * @param definition - Schemas, execution, and mapping behavior for the tool.
 */
export function defineAgentTool<TInput, TOutput, TProps>(
  definition: AgentComponentToolDefinition<TInput, TOutput, TProps>,
): AgentComponentTool<TInput, TOutput, TProps> {
  return Object.freeze({
    ...definition,
    approval: definition.approval ?? "never",
  });
}
