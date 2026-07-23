import { describe, expect, test } from "bun:test";

import { SchemaValidationError, toJSONSchema, validateSchema } from "../../src/core/index.js";
import { inputSchema, outputSchema } from "../helpers/schema.js";

describe("schema contracts", () => {
  test("supports asynchronous Standard Schema validation", async () => {
    const schema = outputSchema(async (value) =>
      typeof value === "number"
        ? { value: value * 2 }
        : { issues: [{ message: "Expected a number" }] },
    );

    await expect(validateSchema(schema, 4)).resolves.toBe(8);
  });

  test("preserves validation issues", async () => {
    const schema = outputSchema(() => ({ issues: [{ message: "Invalid result" }] }));

    try {
      await validateSchema(schema, "wrong");
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      expect((error as SchemaValidationError).issues).toEqual([{ message: "Invalid result" }]);
    }
  });

  test("converts model inputs to draft-07 JSON Schema", () => {
    const schema = inputSchema((value) => ({ value }), {
      type: "object",
      properties: { query: { type: "string" } },
    });

    expect(toJSONSchema(schema)).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
    });
  });
});
