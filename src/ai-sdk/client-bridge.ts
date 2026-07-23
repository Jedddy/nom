import type { DynamicToolUIPart } from "ai";

import { AgentComponentController } from "../core/controller.js";
import { AgentComponentError } from "../core/errors.js";
import type { AIToolAddress } from "./manifest.js";

/** Minimal AI SDK tool call forwarded from a server model to the browser. */
export interface AISDKClientToolCall {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: unknown;
}

/** Dynamic AI SDK UI tool part accepted by {@link AISDKClientBridge.applyToolPart}. */
export type AISDKClientToolPart = DynamicToolUIPart extends infer Part
  ? Part extends DynamicToolUIPart
    ? Omit<Part, "type"> & { readonly type?: "dynamic-tool" }
    : never
  : never;

/** Successful acknowledgement returned after a browser component applies a tool call. */
export interface AISDKAddToolOutputValue {
  readonly tool: string;
  readonly toolCallId: string;
  readonly state?: "output-available";
  readonly output: { readonly status: "applied" };
}

/** Redacted error acknowledgement returned when browser component execution fails. */
export interface AISDKAddToolErrorValue {
  readonly tool: string;
  readonly toolCallId: string;
  readonly state: "output-error";
  readonly errorText: string;
}

/** AI SDK-compatible callback used to submit browser-side tool outcomes. */
export type AISDKAddToolOutput = (
  value: AISDKAddToolOutputValue | AISDKAddToolErrorValue,
) => void | PromiseLike<void>;

/** Configuration for one chat-scoped browser execution bridge. */
export interface AISDKClientBridgeOptions {
  /** Stable chat identity used to namespace tool call ids. */
  readonly chatId: string;
  /** Browser controller containing the mounted component registrations. */
  readonly controller: AgentComponentController;
  /** Component-only routing returned by an AI SDK adapter. */
  readonly routing: ReadonlyMap<string, AIToolAddress>;
  /** Maximum unique tool calls retained for replay protection. Defaults to 1,000. */
  readonly maxTrackedCalls?: number;
}

interface TrackedExecution {
  readonly promise: Promise<void>;
}

/**
 * Applies AI SDK tool calls and streamed tool parts to browser-registered components.
 *
 * Create one bridge per chat so replay protection remains scoped to that conversation.
 */
export class AISDKClientBridge {
  readonly #chatId: string;
  readonly #controller: AgentComponentController;
  readonly #executions = new Map<string, TrackedExecution>();
  readonly #knownCallIds = new Set<string>();
  readonly #callFingerprints = new Map<string, string>();
  readonly #partFingerprints = new Map<string, string>();
  readonly #terminalStates = new Map<string, string>();
  readonly #routing: ReadonlyMap<string, AIToolAddress>;
  readonly #maxTrackedCalls: number;

  constructor({ chatId, controller, routing, maxTrackedCalls = 1_000 }: AISDKClientBridgeOptions) {
    this.#chatId = chatId;
    this.#controller = controller;
    this.#routing = routing;
    this.#maxTrackedCalls = maxTrackedCalls;
  }

  /** Executes a forwarded component call and reports only a success or redacted failure receipt. */
  async handleToolCall(
    call: AISDKClientToolCall,
    addToolOutput: AISDKAddToolOutput,
  ): Promise<void> {
    const address = this.#resolve(call.toolName);
    const fingerprint = serialize({ toolName: call.toolName, input: call.input });
    this.#trackCall(call.toolCallId);
    this.#recordCall(call.toolCallId, fingerprint, address);
    const existing = this.#executions.get(call.toolCallId);
    if (existing) {
      return await existing.promise;
    }

    const promise = this.#execute(call, address, addToolOutput);
    this.#executions.set(call.toolCallId, { promise });
    return await promise;
  }

  /** Applies one streamed dynamic-tool lifecycle part to the targeted component. */
  async applyToolPart(part: AISDKClientToolPart): Promise<void> {
    if (part.state === "input-streaming") {
      return;
    }

    const address = this.#resolve(part.toolName);
    this.#trackCall(part.toolCallId);
    this.#recordCall(
      part.toolCallId,
      serialize({ toolName: part.toolName, input: part.input }),
      address,
    );
    const eventKey = `${part.toolCallId}:${part.state}`;
    const fingerprint = serialize(part);
    const previousFingerprint = this.#partFingerprints.get(eventKey);
    if (previousFingerprint) {
      if (previousFingerprint !== fingerprint) {
        this.#failConflict(address, part.toolCallId);
      }
      return;
    }
    this.#partFingerprints.set(eventKey, fingerprint);
    if (isTerminalState(part.state)) {
      const terminalState = this.#terminalStates.get(part.toolCallId);
      if (terminalState && terminalState !== part.state) {
        this.#failConflict(address, part.toolCallId);
      }
      this.#terminalStates.set(part.toolCallId, part.state);
    }

    const request = {
      ...address,
      requestId: this.#requestId(part.toolCallId),
    };
    switch (part.state) {
      case "input-available":
      case "approval-requested":
        this.#controller.beginRequest(request);
        return;
      case "approval-responded":
        if (part.approval.approved) {
          this.#controller.beginRequest(request);
        } else {
          this.#controller.failRequest({ ...request, code: "authorization-denied" });
        }
        return;
      case "output-available":
        await this.#controller.applyOutput({ ...request, output: part.output });
        return;
      case "output-denied":
        this.#controller.failRequest({ ...request, code: "authorization-denied" });
        return;
      case "output-error":
        this.#controller.failRequest({
          ...request,
          code: "adapter-failed",
          cause: new Error(part.errorText),
        });
        return;
    }
  }

  async #execute(
    call: AISDKClientToolCall,
    address: AIToolAddress,
    addToolOutput: AISDKAddToolOutput,
  ): Promise<void> {
    try {
      await this.#controller.execute({
        ...address,
        input: call.input,
        requestId: this.#requestId(call.toolCallId),
      });
      await addToolOutput({
        tool: call.toolName,
        toolCallId: call.toolCallId,
        output: { status: "applied" },
      });
    } catch (cause) {
      await addToolOutput({
        tool: call.toolName,
        toolCallId: call.toolCallId,
        state: "output-error",
        errorText: "The component tool could not be applied.",
      });
      throw cause;
    }
  }

  #resolve(toolName: string): AIToolAddress {
    const address = this.#routing.get(toolName);
    if (!address) {
      throw new AgentComponentError(
        "adapter-failed",
        `AI SDK tool "${toolName}" has no active component route.`,
      );
    }
    return address;
  }

  #trackCall(toolCallId: string): void {
    if (this.#knownCallIds.has(toolCallId)) {
      return;
    }
    if (this.#knownCallIds.size >= this.#maxTrackedCalls) {
      throw new AgentComponentError(
        "adapter-failed",
        `AI SDK bridge exceeded its ${this.#maxTrackedCalls} tracked-call limit.`,
      );
    }
    this.#knownCallIds.add(toolCallId);
  }

  #recordCall(toolCallId: string, fingerprint: string, address: AIToolAddress): void {
    const previousFingerprint = this.#callFingerprints.get(toolCallId);
    if (previousFingerprint && previousFingerprint !== fingerprint) {
      this.#failConflict(address, toolCallId);
    }
    this.#callFingerprints.set(toolCallId, fingerprint);
  }

  #failConflict(address: AIToolAddress, toolCallId: string): never {
    const error = new AgentComponentError(
      "adapter-failed",
      `Conflicting replay for AI SDK tool call "${toolCallId}".`,
    );
    this.#controller.failRequest({
      ...address,
      requestId: this.#requestId(toolCallId),
      code: "adapter-failed",
      cause: error,
    });
    throw error;
  }

  #requestId(toolCallId: string): string {
    return `${this.#chatId}:${toolCallId}`;
  }
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch (cause) {
    throw new AgentComponentError(
      "adapter-failed",
      "AI SDK tool events must be JSON-serializable.",
      { cause },
    );
  }
}

function isTerminalState(state: AISDKClientToolPart["state"]): boolean {
  return state === "output-available" || state === "output-denied" || state === "output-error";
}
