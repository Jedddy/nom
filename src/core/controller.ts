import type {
  AgentComponentManifest,
  AgentModelOutput,
  AgentComponentRegistration,
  AgentComponentRegistrationHandle,
  AgentComponentResult,
  AgentComponentTool,
  AgentToolApproval,
  AgentToolContext,
} from "./contracts.js";
import {
  AgentComponentError,
  SchemaValidationError,
  type AgentComponentErrorCode,
} from "./errors.js";
import type {
  AgentPipelineEvent,
  AgentPipelineEventContext,
  AgentPipelineEventListener,
  AgentPipelineIssuePath,
  AgentPipelinePayload,
  AgentRequestFailedEvent,
} from "./events.js";
import { AgentComponentRegistry } from "./registry.js";
import { validateSchema } from "./schema.js";
import { summarizePayload, type AgentPayloadMode } from "./summarize.js";
import { createFailureSnapshot, idleSnapshot, type AgentComponentSnapshot } from "./state.js";

/** Requests local execution of a registered component tool. */
export interface AgentComponentExecutionRequest {
  readonly componentId: string;
  readonly toolKey: string;
  readonly input: unknown;
  readonly requestId?: string;
  readonly signal?: AbortSignal;
}

/** Applies externally produced output to a registered component tool. */
export interface AgentComponentOutputRequest {
  readonly componentId: string;
  readonly toolKey: string;
  readonly output: unknown;
  readonly requestId?: string;
}

/** Identifies one component tool request without carrying input or output. */
export interface AgentComponentTargetRequest {
  readonly componentId: string;
  readonly toolKey: string;
  readonly requestId?: string;
}

/** Requests the model-visible projection for validated tool output. */
export interface AgentComponentProjectionRequest {
  readonly componentId: string;
  readonly toolKey: string;
  readonly output: unknown;
  readonly requestId: string;
}

/** Failure codes an external adapter may publish to a component. */
export type AgentExternalFailureCode =
  "adapter-failed" | "authorization-denied" | "tool-unavailable";

/** Publishes an externally detected failure for a component request. */
export interface AgentComponentFailureRequest extends AgentComponentTargetRequest {
  readonly code: AgentExternalFailureCode;
  readonly cause?: unknown;
}

/** Information passed to the host authorization policy before a tool executes. */
export interface AgentAuthorizationRequest {
  readonly componentId: string;
  readonly toolKey: string;
  readonly input: unknown;
  readonly approval: AgentToolApproval;
  readonly requestId: string;
  readonly signal: AbortSignal;
}

/** A diagnostic event emitted after a request publishes a safe component failure. */
export interface AgentControllerErrorEvent {
  readonly componentId: string;
  readonly toolKey: string;
  readonly requestId: string;
  readonly error: AgentComponentError;
}

/**
 * Number of pipeline events retained for the devtools panel by default.
 *
 * One successful request emits seven events, so this retains roughly the last thirty
 * requests — far enough back to cover the supersession and retry sequences a developer
 * scrolls to, while keeping the retained set small enough to hold and render. It applies
 * only once devtools options are supplied; a controller without them retains nothing.
 */
const DEFAULT_HISTORY_LIMIT = 200;

/**
 * Devtools capabilities for one controller, each opted into independently.
 *
 * Authority stays with the host that constructs the controller: mounting the panel never
 * grants a capability that was not enabled here.
 */
export interface AgentDevtoolsOptions {
  /**
   * Attaches raw input, output, and props values to events instead of structural summaries.
   *
   * Enabling it delivers host data to every subscriber on this controller, including any
   * logging or telemetry integration that subscribes.
   */
  readonly verbatimPayloads?: boolean;
  /**
   * Allows the panel to fire tool calls, the only devtools capability that writes.
   *
   * Separate from the payload switch because read sensitivity and write capability are
   * different risks; the panel hides the control entirely while this is off.
   */
  readonly mockFire?: boolean;
  /** Maximum number of retained events; the oldest are discarded past it. */
  readonly historyLimit?: number;
}

/** The devtools configuration a controller resolved at construction, fixed for its lifetime. */
export interface AgentDevtoolsSettings {
  /** Whether the host supplied devtools options at all. */
  readonly enabled: boolean;
  /** Which of the two payload modes events on this controller carry. */
  readonly payloadMode: AgentPayloadMode;
  /** Whether the panel may fire tool calls. */
  readonly mockFire: boolean;
  /**
   * Number of events retained for a subscriber that attaches later.
   *
   * Zero when the host supplied no devtools options, because retention is itself a
   * devtools capability: an unconfigured controller in a production build must not
   * accumulate events for a panel that will never read them.
   */
  readonly historyLimit: number;
}

/** Host policies and diagnostics for an {@link AgentComponentController}. */
export interface AgentComponentControllerOptions {
  /** Approves or denies tool calls; approval-required tools deny by default. */
  readonly authorize?: (request: AgentAuthorizationRequest) => boolean | Promise<boolean>;
  /** Receives the detailed error while render-facing snapshots remain redacted. */
  readonly onError?: (event: AgentControllerErrorEvent) => void;
  /** Enables and configures the devtools event stream for this controller. */
  readonly devtools?: AgentDevtoolsOptions;
}

type StateListener = () => void;

interface ActiveRequest {
  readonly token: symbol;
  readonly componentId: string;
  readonly toolKey: string;
  readonly requestId: string;
  readonly abortController: AbortController;
  readonly releaseExternalAbort: () => void;
  /** Guards the terminal event, which a superseded request reaches twice. */
  terminalEmitted: boolean;
}

/**
 * Registers component capabilities, executes validated tools, and publishes render snapshots.
 *
 * One controller should be shared by the React tree and the host integration that addresses it.
 */
export class AgentComponentController {
  readonly #activeRequests = new Map<string, ActiveRequest>();
  readonly #listeners = new Map<string, Set<StateListener>>();
  readonly #eventListeners = new Set<AgentPipelineEventListener>();
  readonly #registry = new AgentComponentRegistry();
  readonly #snapshots = new Map<string, AgentComponentSnapshot>();
  readonly #options: AgentComponentControllerOptions;
  readonly #devtools: AgentDevtoolsSettings;
  /** Ring of retained events; `#historyNext` marks the oldest slot once it is full. */
  readonly #history: AgentPipelineEvent[] = [];
  #historyNext = 0;
  /** Cached read snapshot, discarded when an event is recorded so identity tracks writes. */
  #historySnapshot: readonly AgentPipelineEvent[] | undefined;
  #requestSequence = 0;

  constructor(options: AgentComponentControllerOptions = {}) {
    this.#options = options;
    this.#devtools = resolveDevtoolsSettings(options.devtools);
  }

  /** Registers one component instance and returns its ownership handle. */
  register<TProps>(
    registration: AgentComponentRegistration<TProps>,
  ): AgentComponentRegistrationHandle<TProps> {
    const registeredId = registration.id;
    const handle = this.#registry.register(registration);

    return {
      update: (nextRegistration) => handle.update(nextRegistration),
      unregister: () => {
        const removed = handle.unregister();
        if (removed) {
          this.#clearComponent(registeredId);
        }
        return removed;
      },
    };
  }

  /** Returns the immutable model-facing manifest for all active registrations. */
  getManifest(): AgentComponentManifest {
    return this.#registry.getManifest();
  }

  /** Subscribes to manifest changes and returns an unsubscribe function. */
  subscribeRegistry(listener: () => void): () => void {
    return this.#registry.subscribe(listener);
  }

  /** Returns the current lifecycle snapshot for a component, or `idle` when absent. */
  getSnapshot(componentId: string): AgentComponentSnapshot {
    return this.#snapshots.get(componentId) ?? idleSnapshot;
  }

  /** Subscribes to lifecycle changes for one component id. */
  subscribe(componentId: string, listener: StateListener): () => void {
    const listeners = this.#listeners.get(componentId) ?? new Set<StateListener>();
    listeners.add(listener);
    this.#listeners.set(componentId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#listeners.delete(componentId);
      }
    };
  }

  /** Subscribes to pipeline events for every component and returns an unsubscribe function. */
  subscribeEvents(listener: AgentPipelineEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => {
      this.#eventListeners.delete(listener);
    };
  }

  /** Returns the retained pipeline events; the array identity changes only on a new event. */
  getEvents(): readonly AgentPipelineEvent[] {
    const snapshot = this.#historySnapshot ?? this.#materializeHistory();
    this.#historySnapshot = snapshot;
    return snapshot;
  }

  /**
   * Returns the devtools capabilities this controller was constructed with.
   *
   * The result is frozen and never changes: a panel can render which payload mode is
   * active and whether mock-fire is available, but cannot turn either on.
   */
  getDevtoolsSettings(): AgentDevtoolsSettings {
    return this.#devtools;
  }

  /** Validates, authorizes, executes, validates output, maps props, and publishes lifecycle state. */
  async execute(request: AgentComponentExecutionRequest): Promise<unknown> {
    const tool = this.#resolveTool(request.componentId, request.toolKey);
    const activeRequest = this.#startRequest(request, request.requestId, request.signal);

    try {
      const input = await runStage(
        "invalid-input",
        "The tool input did not satisfy its runtime schema.",
        () => validateSchema(tool.inputSchema, request.input),
      );
      this.#assertCurrent(activeRequest);
      this.#emit({
        ...eventContext(activeRequest),
        type: "input-validated",
        ...this.#payload("input", input),
      });

      const authorized = await runStage(
        "authorization-denied",
        "The host authorization policy could not approve the request.",
        () => this.#authorize(tool.approval, input, activeRequest),
      );
      this.#assertCurrent(activeRequest);
      if (!authorized) {
        throw new AgentComponentError(
          "authorization-denied",
          "The host application denied this tool request.",
        );
      }
      this.#emit({ ...eventContext(activeRequest), type: "authorized" });

      const execute = tool.execute;
      if (!execute) {
        throw new AgentComponentError(
          "tool-unavailable",
          `Tool "${request.toolKey}" does not have a local executor.`,
        );
      }

      const context = createToolContext(activeRequest);
      const output = await runStage(
        "execution-failed",
        "The registered tool failed during execution.",
        () => execute(input, context),
      );
      this.#assertCurrent(activeRequest);
      this.#emit({ ...eventContext(activeRequest), type: "executed" });
      return await this.#validateMapAndPublish(tool, output, context, activeRequest);
    } catch (cause) {
      throw this.#handleFailure(activeRequest, cause);
    } finally {
      this.#finish(activeRequest);
    }
  }

  /** Begins the loading lifecycle for a tool that will execute outside this controller. */
  beginRequest(request: AgentComponentTargetRequest): string {
    this.#resolveTool(request.componentId, request.toolKey);
    return this.#joinOrStartRequest(request, request.requestId).requestId;
  }

  /** Validates tool output and returns its deliberately selected model-visible projection. */
  async projectModelOutput(request: AgentComponentProjectionRequest): Promise<AgentModelOutput> {
    const tool = this.#resolveTool(request.componentId, request.toolKey);
    const output = await runStage(
      "invalid-output",
      "The tool output did not satisfy its runtime schema.",
      () => validateSchema(tool.outputSchema, request.output),
    );
    const projectModelOutput = tool.projectModelOutput;
    if (!projectModelOutput) {
      return { type: "text", value: "Component data loaded." };
    }

    const abortController = new AbortController();
    return runStage(
      "projection-failed",
      "The tool output could not be projected for the model.",
      () =>
        projectModelOutput(output, {
          componentId: request.componentId,
          requestId: request.requestId,
          signal: abortController.signal,
        }),
    );
  }

  /** Publishes a safe failure for a tool request executed by an external adapter. */
  failRequest(request: AgentComponentFailureRequest): void {
    this.#resolveTool(request.componentId, request.toolKey);
    const activeRequest = this.#joinOrStartRequest(request, request.requestId);
    const error = new AgentComponentError(
      request.code,
      "An externally executed tool request failed.",
      { cause: request.cause },
    );
    this.#publishFailure(activeRequest, error);
    this.#finish(activeRequest);
  }

  /** Validates and maps output supplied by an external executor into component state. */
  async applyOutput(request: AgentComponentOutputRequest): Promise<unknown> {
    const tool = this.#resolveTool(request.componentId, request.toolKey);
    const activeRequest = this.#joinOrStartRequest(request, request.requestId);
    const context = createToolContext(activeRequest);

    try {
      const output = await this.#validateMapAndPublish(
        tool,
        request.output,
        context,
        activeRequest,
      );
      return output;
    } catch (cause) {
      throw this.#handleFailure(activeRequest, cause);
    } finally {
      this.#finish(activeRequest);
    }
  }

  async #validateMapAndPublish(
    tool: AgentComponentTool<unknown, unknown, unknown>,
    rawOutput: unknown,
    context: AgentToolContext,
    activeRequest: ActiveRequest,
  ): Promise<unknown> {
    const output = await runStage(
      "invalid-output",
      "The tool output did not satisfy its runtime schema.",
      () => validateSchema(tool.outputSchema, rawOutput),
    );
    this.#assertCurrent(activeRequest);
    this.#emit({
      ...eventContext(activeRequest),
      type: "output-validated",
      ...this.#payload("output", output),
    });

    const result = await runStage(
      "mapping-failed",
      "The tool output could not be mapped to component props.",
      () => tool.mapOutput(output, context),
    );
    this.#assertCurrent(activeRequest);
    // Described once and shared, so the mapped stage and its terminal agree exactly.
    const props: PayloadField<"props"> =
      result.status === "success" ? this.#payload("props", result.props) : {};
    this.#emit({ ...eventContext(activeRequest), type: "mapped", ...props });
    this.#publishResult(activeRequest, result, props);
    return output;
  }

  async #authorize(
    approval: AgentToolApproval,
    input: unknown,
    request: ActiveRequest,
  ): Promise<boolean> {
    if (!this.#options.authorize) {
      return approval === "never";
    }

    return this.#options.authorize({
      componentId: request.componentId,
      toolKey: request.toolKey,
      input,
      approval,
      requestId: request.requestId,
      signal: request.abortController.signal,
    });
  }

  #resolveTool(
    componentId: string,
    toolKey: string,
  ): AgentComponentTool<unknown, unknown, unknown> {
    const component = this.#registry.get(componentId);
    if (!component) {
      throw new AgentComponentError(
        "registration-unavailable",
        `Component "${componentId}" is not registered.`,
      );
    }

    const tool = component.tools.find(({ key }) => key === toolKey);
    if (!tool) {
      throw new AgentComponentError(
        "tool-unavailable",
        `Tool "${toolKey}" is not registered for component "${componentId}".`,
      );
    }

    return tool;
  }

  #startRequest(
    address: { readonly componentId: string; readonly toolKey: string },
    requestedId: string | undefined,
    externalSignal?: AbortSignal,
  ): ActiveRequest {
    const previousRequest = this.#activeRequests.get(address.componentId);
    previousRequest?.abortController.abort();
    previousRequest?.releaseExternalAbort();
    if (previousRequest) {
      this.#emitTerminal(previousRequest, {
        ...eventContext(previousRequest),
        type: "request-failed",
        code: "aborted",
      });
    }

    const abortController = new AbortController();
    const request: ActiveRequest = {
      token: Symbol(address.componentId),
      componentId: address.componentId,
      toolKey: address.toolKey,
      requestId: requestedId ?? `${address.componentId}:${++this.#requestSequence}`,
      abortController,
      releaseExternalAbort: connectAbortSignal(externalSignal, abortController),
      terminalEmitted: false,
    };
    this.#activeRequests.set(address.componentId, request);

    const previousProps = getPreviousProps(this.#snapshots.get(address.componentId));
    this.#publish(
      address.componentId,
      Object.freeze({
        status: "loading",
        requestId: request.requestId,
        ...(previousProps === undefined ? {} : { previousProps }),
      }),
    );
    this.#emit({
      ...eventContext(request),
      type: "request-started",
      ...(previousRequest === undefined ? {} : { supersededRequestId: previousRequest.requestId }),
      hasPreviousProps: previousProps !== undefined,
    });

    return request;
  }

  #joinOrStartRequest(
    address: { readonly componentId: string; readonly toolKey: string },
    requestedId: string | undefined,
  ): ActiveRequest {
    const current = this.#activeRequests.get(address.componentId);
    if (
      current &&
      requestedId !== undefined &&
      current.requestId === requestedId &&
      current.toolKey === address.toolKey
    ) {
      return current;
    }

    return this.#startRequest(address, requestedId);
  }

  #publishResult(
    request: ActiveRequest,
    result: AgentComponentResult<unknown>,
    props: PayloadField<"props">,
  ): void {
    this.#publish(
      request.componentId,
      result.status === "success"
        ? Object.freeze({
            status: "success",
            requestId: request.requestId,
            props: result.props,
          })
        : Object.freeze({ status: "empty", requestId: request.requestId }),
    );
    this.#emitTerminal(
      request,
      result.status === "success"
        ? { ...eventContext(request), type: "request-succeeded", ...props }
        : { ...eventContext(request), type: "request-empty" },
    );
  }

  #handleFailure(request: ActiveRequest, cause: unknown): AgentComponentError {
    if (!this.#ownsRequest(request)) {
      const abortion = new AgentComponentError("aborted", "The request is no longer current.", {
        cause,
      });
      this.#emitTerminal(request, failureEvent(request, abortion));
      return abortion;
    }

    let error: AgentComponentError;
    if (request.abortController.signal.aborted) {
      error = new AgentComponentError("aborted", "The request was cancelled.", { cause });
    } else if (cause instanceof AgentComponentError) {
      error = cause;
    } else {
      error = new AgentComponentError("execution-failed", "The request failed.", { cause });
    }
    this.#publishFailure(request, error);
    return error;
  }

  #publishFailure(request: ActiveRequest, error: AgentComponentError): void {
    this.#publish(request.componentId, createFailureSnapshot(request.requestId, error.code));
    this.#emitTerminal(request, failureEvent(request, error));
    this.#options.onError?.({
      componentId: request.componentId,
      toolKey: request.toolKey,
      requestId: request.requestId,
      error,
    });
  }

  #assertCurrent(request: ActiveRequest): void {
    if (!this.#isCurrent(request)) {
      throw new AgentComponentError("aborted", "The request is no longer current.");
    }
  }

  #isCurrent(request: ActiveRequest): boolean {
    return this.#ownsRequest(request) && !request.abortController.signal.aborted;
  }

  #ownsRequest(request: ActiveRequest): boolean {
    return this.#activeRequests.get(request.componentId)?.token === request.token;
  }

  #finish(request: ActiveRequest): void {
    if (this.#activeRequests.get(request.componentId)?.token === request.token) {
      this.#activeRequests.delete(request.componentId);
    }
    request.releaseExternalAbort();
  }

  #clearComponent(componentId: string): void {
    const activeRequest = this.#activeRequests.get(componentId);
    activeRequest?.abortController.abort();
    activeRequest?.releaseExternalAbort();
    this.#activeRequests.delete(componentId);
    const hadSnapshot = this.#snapshots.delete(componentId);
    if (hadSnapshot) {
      this.#notify(componentId);
    }
  }

  #publish(componentId: string, snapshot: AgentComponentSnapshot): void {
    this.#snapshots.set(componentId, snapshot);
    this.#notify(componentId);
  }

  #notify(componentId: string): void {
    for (const listener of this.#listeners.get(componentId) ?? []) {
      listener();
    }
  }

  #emitTerminal(request: ActiveRequest, event: AgentPipelineEvent): void {
    if (request.terminalEmitted) {
      return;
    }
    request.terminalEmitted = true;
    this.#emit(event);
  }

  #emit(event: AgentPipelineEvent): void {
    const recorded = Object.freeze(event);
    this.#record(recorded);
    for (const listener of this.#eventListeners) {
      try {
        listener(recorded);
      } catch {
        // A diagnostic listener must never change the outcome of a request.
      }
    }
  }

  /** Appends to the bounded ring, overwriting the oldest event once the bound is reached. */
  #record(event: AgentPipelineEvent): void {
    // Zero covers both a controller with no devtools options and one that opted out of
    // retention explicitly; live delivery to subscribers is unaffected either way.
    const limit = this.#devtools.historyLimit;
    if (limit === 0) {
      return;
    }

    if (this.#history.length < limit) {
      this.#history.push(event);
    } else {
      this.#history[this.#historyNext] = event;
      this.#historyNext = (this.#historyNext + 1) % limit;
    }
    this.#historySnapshot = undefined;
  }

  /** Reorders the ring oldest-first; only a read pays for it, so recording stays constant time. */
  #materializeHistory(): readonly AgentPipelineEvent[] {
    const oldestFirst = this.#history
      .slice(this.#historyNext)
      .concat(this.#history.slice(0, this.#historyNext));
    return Object.freeze(oldestFirst);
  }

  /**
   * Whether payloads are described at all for this request.
   *
   * A controller with no devtools options and no subscriber has nobody to describe them
   * for, and the cost of describing lives in the summarizer's recursive walk, so the walk
   * is skipped rather than merely discarded.
   */
  #describesPayloads(): boolean {
    return this.#devtools.enabled || this.#eventListeners.size > 0;
  }

  #payload<TKey extends "input" | "output" | "props">(
    key: TKey,
    value: unknown,
  ): PayloadField<TKey> {
    if (!this.#describesPayloads()) {
      return {};
    }

    return { [key]: summarizePayload(value, this.#devtools.payloadMode) } as PayloadField<TKey>;
  }
}

/** The optional payload field one stage event carries, or nothing at all. */
type PayloadField<TKey extends string> = Partial<Record<TKey, AgentPipelinePayload>>;

function resolveDevtoolsSettings(options: AgentDevtoolsOptions | undefined): AgentDevtoolsSettings {
  return Object.freeze({
    enabled: options !== undefined,
    payloadMode: options?.verbatimPayloads === true ? "verbatim" : "structural",
    mockFire: options?.mockFire === true,
    historyLimit: options === undefined ? 0 : resolveHistoryLimit(options.historyLimit),
  });
}

function resolveHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.max(0, Math.floor(limit));
}

function createToolContext(request: ActiveRequest): AgentToolContext {
  return {
    componentId: request.componentId,
    requestId: request.requestId,
    signal: request.abortController.signal,
  };
}

function eventContext(request: ActiveRequest): AgentPipelineEventContext {
  return {
    componentId: request.componentId,
    toolKey: request.toolKey,
    requestId: request.requestId,
    timestamp: Date.now(),
  };
}

function failureEvent(request: ActiveRequest, error: AgentComponentError): AgentRequestFailedEvent {
  const issuePaths = collectIssuePaths(error.cause);

  return {
    ...eventContext(request),
    type: "request-failed",
    code: error.code,
    ...(issuePaths.length === 0 ? {} : { issuePaths }),
  };
}

function collectIssuePaths(cause: unknown): readonly AgentPipelineIssuePath[] {
  if (!(cause instanceof SchemaValidationError)) {
    return [];
  }

  const paths: AgentPipelineIssuePath[] = [];
  for (const issue of cause.issues) {
    if (issue.path) {
      paths.push(Object.freeze(issue.path.map(toPathSegment)));
    }
  }
  return paths;
}

function toPathSegment(segment: PropertyKey | { readonly key: PropertyKey }): string | number {
  const key = typeof segment === "object" ? segment.key : segment;
  return typeof key === "number" ? key : String(key);
}

async function runStage<T>(
  code: AgentComponentErrorCode,
  message: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw new AgentComponentError(code, message, { cause });
  }
}

function getPreviousProps(snapshot: AgentComponentSnapshot | undefined): unknown {
  if (snapshot?.status === "success") {
    return snapshot.props;
  }
  if (snapshot?.status === "loading") {
    return snapshot.previousProps;
  }
  return undefined;
}

function connectAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) {
    return () => undefined;
  }
  if (source.aborted) {
    target.abort(source.reason);
    return () => undefined;
  }

  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}
