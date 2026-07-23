import {
  dynamicTool,
  jsonSchema,
  tool as defineTool,
  type JSONValue,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";

import type { AgentInputSchema, AgentModelOutput, AgentToolApproval } from "../core/contracts.js";
import { AgentComponentController } from "../core/controller.js";
import { AgentComponentError } from "../core/errors.js";
import { toJSONSchema, validateSchema } from "../core/schema.js";
import {
  createAIToolName,
  createAIToolRouting,
  type ActiveAgentManifest,
  type AIToolAddress,
  type AIToolRoutingLimits,
  toActiveAgentManifest,
} from "./manifest.js";

/** AI SDK tools plus the routing metadata for component-targeted calls. */
export interface AISDKToolAdapter {
  /** Registry version used to create this adapter. */
  readonly manifestVersion: number;
  /** Default tools and generated component tools to pass to AI SDK. */
  readonly tools: ToolSet;
  /** Maps generated component tool names to component addresses; excludes default tools. */
  readonly routing: ReadonlyMap<string, AIToolAddress>;
}

/** Options shared by same-runtime and split-runtime AI SDK adapters. */
export interface AISDKToolOptions {
  /**
   * Host-owned tools that remain available independently of mounted components.
   *
   * Every tool must include a non-empty description explaining when the model should call it.
   * Default tools execute through AI SDK and are not forwarded through component routing.
   */
  readonly defaultTools?: ToolSet;
}

/** Server-owned definition for one component tool address. */
export interface AISDKServerToolDefinition {
  /** Canonical model-facing description. */
  readonly description: string;
  /** Canonical schema used to validate model input. */
  readonly inputSchema: AgentInputSchema<unknown>;
  /** Canonical approval requirement. */
  readonly approval: AgentToolApproval;
  /** Executes on the server; omit to forward the call to the browser. */
  readonly execute?: (input: unknown, options: ToolExecutionOptions) => unknown | Promise<unknown>;
  /** Selects server output that may safely be returned to the model. */
  readonly projectModelOutput?: (
    output: unknown,
    options: { readonly toolCallId: string; readonly input: unknown },
  ) => AgentModelOutput | Promise<AgentModelOutput>;
}

/** Security, limits, and catalog resolution for split-runtime component tools. */
export interface AISDKServerToolOptions extends AIToolRoutingLimits, AISDKToolOptions {
  /** Resolves an untrusted active address through the server-owned tool catalog. */
  readonly resolve: (address: AIToolAddress) => AISDKServerToolDefinition | undefined;
  /** Authorizes a validated server-side tool call before its executor runs. */
  readonly authorize?: (request: {
    readonly address: AIToolAddress;
    readonly input: unknown;
    readonly approval: AgentToolApproval;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  }) => boolean | Promise<boolean>;
  /** Maximum allowed length of a resolved component tool description. */
  readonly maxDescriptionLength?: number;
  /** Maximum allowed serialized length of a resolved component input schema. */
  readonly maxSchemaLength?: number;
  /** Rejects a client manifest whose version differs from the expected session version. */
  readonly expectedManifestVersion?: number;
}

/**
 * Creates AI SDK tools for a controller that shares the model's JavaScript runtime.
 *
 * @param controller - Controller containing the active component registrations.
 * @param options - Optional host-owned default tools.
 */
export function createAISDKTools(
  controller: AgentComponentController,
  options: AISDKToolOptions = {},
): AISDKToolAdapter {
  const manifest = controller.getManifest();
  const activeManifest = toActiveAgentManifest(manifest);
  const routing = createAIToolRouting(activeManifest);
  const tools = copyDefaultTools(options.defaultTools);

  for (const component of manifest.components) {
    for (const registeredTool of component.tools) {
      const address = { componentId: component.id, toolKey: registeredTool.key };
      const name = createAIToolName(component.id, registeredTool.key);
      assertAvailableToolName(tools, name);
      tools[name] = dynamicTool({
        description: `${component.instructions}\n\n${registeredTool.description}`,
        inputSchema: jsonSchema(registeredTool.inputSchema as Parameters<typeof jsonSchema>[0]),
        needsApproval: registeredTool.approval === "required",
        execute: (input, { toolCallId, abortSignal }) =>
          controller.execute({
            ...address,
            input,
            requestId: toolCallId,
            ...(abortSignal ? { signal: abortSignal } : {}),
          }),
        toModelOutput: async ({ toolCallId, output }) =>
          asToolResultOutput(
            await controller.projectModelOutput({
              ...address,
              output,
              requestId: toolCallId,
            }),
          ),
      });
    }
  }

  return Object.freeze({
    manifestVersion: manifest.version,
    tools: Object.freeze(tools),
    routing,
  });
}

/**
 * Creates canonical AI SDK tools for a server model and browser component split.
 *
 * Client manifest addresses are treated as untrusted and must resolve through `options.resolve`.
 */
export function createAISDKServerTools(
  manifest: ActiveAgentManifest,
  options: AISDKServerToolOptions,
): AISDKToolAdapter {
  if (
    options.expectedManifestVersion !== undefined &&
    manifest.version !== options.expectedManifestVersion
  ) {
    throw new AgentComponentError(
      "adapter-failed",
      `Active manifest version ${manifest.version} does not match expected version ${options.expectedManifestVersion}.`,
    );
  }

  const routing = createAIToolRouting(manifest, options);
  const tools = copyDefaultTools(options.defaultTools);
  const maxDescriptionLength = options.maxDescriptionLength ?? 4_000;
  const maxSchemaLength = options.maxSchemaLength ?? 16_000;

  for (const [name, address] of routing) {
    assertAvailableToolName(tools, name);
    const definition = options.resolve(address);
    if (!definition) {
      throw new AgentComponentError(
        "adapter-failed",
        `Server catalog does not allow "${address.componentId}/${address.toolKey}".`,
      );
    }

    const schema = toJSONSchema(definition.inputSchema);
    if (definition.description.length > maxDescriptionLength) {
      throw new AgentComponentError(
        "adapter-failed",
        `Server tool description exceeds ${maxDescriptionLength} characters.`,
      );
    }
    if (JSON.stringify(schema).length > maxSchemaLength) {
      throw new AgentComponentError(
        "adapter-failed",
        `Server tool schema exceeds ${maxSchemaLength} characters.`,
      );
    }

    const inputSchema = definition.inputSchema;
    const needsApproval = definition.approval === "required";
    const toModelOutput = async ({
      toolCallId,
      input,
      output,
    }: {
      toolCallId: string;
      input: unknown;
      output: unknown;
    }): Promise<ModelToolResult> => {
      if (!definition.execute || !definition.projectModelOutput) {
        return { type: "text", value: "Component data loaded." };
      }
      return asToolResultOutput(await definition.projectModelOutput(output, { toolCallId, input }));
    };

    const execute = definition.execute;
    tools[name] = execute
      ? dynamicTool({
          description: definition.description,
          inputSchema,
          needsApproval,
          execute: async (input, executionOptions) => {
            const validatedInput = await validateSchema(inputSchema, input);
            const authorized = options.authorize
              ? await options.authorize({
                  address,
                  input: validatedInput,
                  approval: definition.approval,
                  toolCallId: executionOptions.toolCallId,
                  ...(executionOptions.abortSignal ? { signal: executionOptions.abortSignal } : {}),
                })
              : definition.approval === "never";
            if (!authorized) {
              throw new AgentComponentError(
                "authorization-denied",
                "The server authorization policy denied this tool request.",
              );
            }
            return execute(validatedInput, executionOptions);
          },
          toModelOutput,
        })
      : defineTool<unknown, unknown>({
          type: "dynamic",
          description: definition.description,
          inputSchema,
          outputSchema: jsonSchema({}),
          needsApproval,
          toModelOutput,
        });
  }

  return Object.freeze({
    manifestVersion: manifest.version,
    tools: Object.freeze(tools),
    routing,
  });
}

type ModelToolResult =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "json"; readonly value: JSONValue };

function asToolResultOutput(output: AgentModelOutput): ModelToolResult {
  return output as ModelToolResult;
}

function copyDefaultTools(defaultTools: ToolSet | undefined): ToolSet {
  const tools: ToolSet = {};

  for (const [name, defaultTool] of Object.entries(defaultTools ?? {})) {
    if (
      typeof defaultTool.description !== "string" ||
      defaultTool.description.trim().length === 0
    ) {
      throw new AgentComponentError(
        "adapter-failed",
        `Default tool "${name}" must include a non-empty description explaining when the model should call it.`,
      );
    }

    tools[name] = defaultTool;
  }

  return tools;
}

function assertAvailableToolName(tools: ToolSet, name: string): void {
  if (Object.hasOwn(tools, name)) {
    throw new AgentComponentError(
      "adapter-failed",
      `Default tool name "${name}" collides with a component tool.`,
    );
  }
}
