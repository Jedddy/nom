import type {
  AgentComponentManifest,
  AgentComponentRegistration,
  AgentComponentRegistrationHandle,
  AgentComponentTool,
} from "./contracts.js";
import { AgentComponentError } from "./errors.js";
import { toJSONSchema } from "./schema.js";

type RegistryListener = () => void;

interface RegisteredComponent {
  readonly id: string;
  readonly instructions: string;
  readonly tools: readonly AgentComponentTool<unknown, unknown, unknown>[];
}

interface RegistryEntry {
  readonly owner: symbol;
  readonly component: RegisteredComponent;
}

/** Stores active component registrations and produces immutable capability manifests. */
export class AgentComponentRegistry {
  readonly #components = new Map<string, RegistryEntry>();
  readonly #listeners = new Set<RegistryListener>();
  #manifest: AgentComponentManifest | undefined;
  #version = 0;

  /** Registers one component and returns a handle that owns its lifetime. */
  register<TProps>(
    registration: AgentComponentRegistration<TProps>,
  ): AgentComponentRegistrationHandle<TProps> {
    this.#validateRegistration(registration);
    const registeredId = registration.id;

    if (this.#components.has(registeredId)) {
      throw new AgentComponentError(
        "duplicate-registration",
        `Component "${registeredId}" is already registered.`,
      );
    }

    const owner = Symbol(registeredId);
    this.#components.set(registeredId, {
      owner,
      component: normalizeRegistration(registration),
    });
    this.#changed();

    return {
      update: (nextRegistration) => {
        this.#update(owner, registeredId, nextRegistration);
      },
      unregister: () => this.#unregister(owner, registeredId),
    };
  }

  /** Returns the normalized registration for a component id, when active. */
  get(componentId: string): RegisteredComponent | undefined {
    return this.#components.get(componentId)?.component;
  }

  /** Returns a cached immutable manifest of active component capabilities. */
  getManifest(): AgentComponentManifest {
    if (!this.#manifest) {
      const components = Array.from(this.#components.values(), ({ component }) =>
        Object.freeze({
          id: component.id,
          instructions: component.instructions,
          tools: Object.freeze(
            component.tools.map((tool) =>
              Object.freeze({
                key: tool.key,
                description: tool.description,
                approval: tool.approval,
                inputSchema: cloneAndFreezeSchema(toJSONSchema(tool.inputSchema)),
              }),
            ),
          ),
        }),
      );

      this.#manifest = Object.freeze({
        version: this.#version,
        components: Object.freeze(components),
      });
    }

    return this.#manifest;
  }

  /** Subscribes to registration changes and returns an unsubscribe function. */
  subscribe(listener: RegistryListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #update<TProps>(
    owner: symbol,
    registeredId: string,
    registration: AgentComponentRegistration<TProps>,
  ): void {
    this.#validateRegistration(registration);

    if (registration.id !== registeredId) {
      throw new AgentComponentError(
        "invalid-registration",
        "A registration handle cannot change its component id.",
      );
    }

    const current = this.#components.get(registeredId);
    if (current?.owner !== owner) {
      throw new AgentComponentError(
        "registration-unavailable",
        `Component "${registeredId}" is no longer owned by this registration.`,
      );
    }

    this.#components.set(registeredId, {
      owner,
      component: normalizeRegistration(registration),
    });
    this.#changed();
  }

  #unregister(owner: symbol, componentId: string): boolean {
    const current = this.#components.get(componentId);
    if (current?.owner !== owner) {
      return false;
    }

    this.#components.delete(componentId);
    this.#changed();
    return true;
  }

  #validateRegistration<TProps>(registration: AgentComponentRegistration<TProps>): void {
    if (!registration.id.trim()) {
      throw new AgentComponentError(
        "invalid-registration",
        "A component registration requires a non-empty id.",
      );
    }

    if (registration.tools.length === 0) {
      throw new AgentComponentError(
        "invalid-registration",
        `Component "${registration.id}" must expose at least one tool.`,
      );
    }

    const keys = new Set<string>();
    for (const tool of registration.tools) {
      if (!tool.key.trim() || keys.has(tool.key)) {
        throw new AgentComponentError(
          "invalid-registration",
          `Component "${registration.id}" has an empty or duplicate tool key.`,
        );
      }
      keys.add(tool.key);
    }
  }

  #changed(): void {
    this.#version += 1;
    this.#manifest = undefined;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function normalizeRegistration<TProps>(
  registration: AgentComponentRegistration<TProps>,
): RegisteredComponent {
  return Object.freeze({
    id: registration.id,
    instructions: registration.instructions,
    tools: Object.freeze(registration.tools.map(eraseTool)),
  });
}

function eraseTool(
  tool: AgentComponentTool<unknown, unknown, unknown>,
): AgentComponentTool<unknown, unknown, unknown> {
  return Object.freeze({ ...tool });
}

function cloneAndFreezeSchema(schema: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  freezeJSON(clone);
  return clone;
}

function freezeJSON(value: unknown): void {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const nestedValue of Object.values(value)) {
    freezeJSON(nestedValue);
  }
  Object.freeze(value);
}
