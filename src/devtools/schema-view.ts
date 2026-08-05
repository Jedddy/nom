/**
 * Readable renderings of a generated input JSON Schema.
 *
 * A developer opens the manifest view to work out why the model never called their tool, so
 * the schema has to be legible at a glance: which properties exist, which are required, and
 * what type each one accepts. These helpers describe the schema rather than validate it —
 * anything they cannot recognise falls back to the schema's own JSON, which is always shown
 * alongside so nothing the model receives is hidden by a summary that missed a keyword.
 */

/** One property of an object input schema, as the manifest view lists it. */
export interface AgentSchemaField {
  /** The property name the model must use. */
  readonly name: string;
  /** A short human-readable type, such as `string` or `array of string`. */
  readonly type: string;
  /** Whether the schema lists this property in `required`. */
  readonly required: boolean;
  /** The property's own `description`, when the schema carries one. */
  readonly description?: string;
}

/**
 * Lists the top-level properties of an object input schema.
 *
 * Returns an empty list for any schema without recognisable `properties`, including the
 * empty schema a tool gets when its validator supplies none; the caller renders the raw
 * JSON in that case rather than claiming the tool takes no input.
 */
export function describeSchemaFields(
  schema: Readonly<Record<string, unknown>>,
): readonly AgentSchemaField[] {
  const properties = asRecord(schema["properties"]);
  if (properties === undefined) {
    return [];
  }

  const required = new Set(
    Array.isArray(schema["required"])
      ? schema["required"].filter((name): name is string => typeof name === "string")
      : [],
  );

  return Object.entries(properties).map(([name, definition]) => {
    const description = asRecord(definition)?.["description"];
    return {
      name,
      type: describeSchemaType(definition),
      required: required.has(name),
      ...(typeof description === "string" ? { description } : {}),
    };
  });
}

/**
 * Describes one schema node's accepted type in a single short phrase.
 *
 * Deliberately shallow: nested object shapes are named rather than expanded, because the
 * full JSON is shown beside this and a recursive expansion would reproduce it badly.
 */
export function describeSchemaType(node: unknown): string {
  const schema = asRecord(node);
  if (schema === undefined) {
    return "unknown";
  }

  const constant = schema["const"];
  if (constant !== undefined) {
    return JSON.stringify(constant) ?? "unknown";
  }

  const enumValues = schema["enum"];
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues.map((value) => JSON.stringify(value) ?? "unknown").join(" | ");
  }

  const union = schema["anyOf"] ?? schema["oneOf"];
  if (Array.isArray(union) && union.length > 0) {
    return union.map(describeSchemaType).join(" | ");
  }

  const reference = schema["$ref"];
  if (typeof reference === "string") {
    return reference;
  }

  const type = schema["type"];
  if (Array.isArray(type)) {
    return type.filter((value): value is string => typeof value === "string").join(" | ");
  }

  if (type === "array") {
    const items = schema["items"];
    return items === undefined ? "array" : `array of ${describeSchemaType(items)}`;
  }

  return typeof type === "string" ? type : "unknown";
}

/** Pretty-prints the schema exactly as generated, so nothing the model receives is hidden. */
export function formatSchemaJson(schema: Readonly<Record<string, unknown>>): string {
  try {
    return JSON.stringify(schema, null, 2) ?? "undefined";
  } catch {
    // A schema that cannot be serialized is still worth reporting as present.
    return "[unserializable schema]";
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
