import {
  defineAgentTool,
  type AgentComponentRegistration,
  type AgentComponentResult,
  type AgentToolApproval,
} from "../../src/core/index.js";
import { inputSchema, outputSchema } from "./schema.js";

export interface TestComponentProps {
  readonly items: readonly string[];
}

export interface TestToolInput {
  readonly query: string;
}

interface TestRegistrationOptions {
  readonly approval?: AgentToolApproval;
  readonly execute?: (input: TestToolInput, signal: AbortSignal) => string[] | Promise<string[]>;
  readonly mapOutput?: (
    output: readonly string[],
  ) => AgentComponentResult<TestComponentProps> | Promise<AgentComponentResult<TestComponentProps>>;
}

export function testRegistration(
  id: string,
  options: TestRegistrationOptions = {},
): AgentComponentRegistration<TestComponentProps> {
  const execute = options.execute;

  return {
    id,
    instructions: "Show items matching the user's query.",
    tools: [
      defineAgentTool({
        key: "load-items",
        description: "Load matching items.",
        inputSchema: inputSchema((value) =>
          typeof value === "object" &&
          value !== null &&
          "query" in value &&
          typeof value.query === "string"
            ? { value: { query: value.query } }
            : { issues: [{ message: "Expected a string query" }] },
        ),
        outputSchema: outputSchema((value) =>
          Array.isArray(value) && value.every((item) => typeof item === "string")
            ? { value: value as string[] }
            : { issues: [{ message: "Expected string items" }] },
        ),
        ...(options.approval ? { approval: options.approval } : {}),
        execute: execute
          ? (input, { signal }) => execute(input, signal)
          : async ({ query }) => [query],
        mapOutput:
          options.mapOutput ??
          ((items) =>
            items.length === 0 ? { status: "empty" } : { status: "success", props: { items } }),
      }),
    ],
  };
}
