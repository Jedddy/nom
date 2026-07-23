import type { AgentInputSchema, AgentOutputSchema } from "../../src/core/contracts.js";

type ValidationResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: readonly { readonly message: string }[] };

export function inputSchema<T>(
  validate: (value: unknown) => ValidationResult<T> | Promise<ValidationResult<T>>,
  jsonSchema: Record<string, unknown> = {},
): AgentInputSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "nom-test",
      validate,
      jsonSchema: {
        input: () => jsonSchema,
        output: () => jsonSchema,
      },
    },
  };
}

export function outputSchema<T>(
  validate: (value: unknown) => ValidationResult<T> | Promise<ValidationResult<T>>,
): AgentOutputSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "nom-test",
      validate,
    },
  };
}
