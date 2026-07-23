import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { AgentInputSchema } from "./contracts.js";
import { SchemaValidationError } from "./errors.js";

/** Validates an unknown value with Standard Schema and returns its typed value. */
export async function validateSchema<T>(
  schema: StandardSchemaV1<unknown, T>,
  value: unknown,
): Promise<T> {
  const result = await schema["~standard"].validate(value);

  if (result.issues) {
    throw new SchemaValidationError(result.issues);
  }

  return result.value;
}

/** Converts an agent input schema to the draft-07 JSON Schema supplied to models. */
export function toJSONSchema<T>(schema: AgentInputSchema<T>): Record<string, unknown> {
  return schema["~standard"].jsonSchema.input({ target: "draft-07" });
}
