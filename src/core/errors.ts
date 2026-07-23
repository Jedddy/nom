import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Stable failure categories used by controller errors and render snapshots. */
export type AgentComponentErrorCode =
  | "aborted"
  | "adapter-failed"
  | "authorization-denied"
  | "duplicate-registration"
  | "execution-failed"
  | "invalid-input"
  | "invalid-output"
  | "invalid-registration"
  | "mapping-failed"
  | "projection-failed"
  | "registration-unavailable"
  | "tool-unavailable";

/** A typed operational error raised by the component protocol. */
export class AgentComponentError extends Error {
  /** Machine-readable category for policy and diagnostics. */
  readonly code: AgentComponentErrorCode;

  constructor(code: AgentComponentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentComponentError";
    this.code = code;
  }
}

/** Preserves issues returned by a Standard Schema validator. */
export class SchemaValidationError extends Error {
  /** The validation issues reported by the schema implementation. */
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(issues.map(({ message }) => message).join("; "));
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}
