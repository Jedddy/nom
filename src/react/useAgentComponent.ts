"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import type {
  AgentComponentRegistration,
  AgentComponentRegistrationHandle,
} from "../core/contracts.js";
import { idleSnapshot, type AgentComponentSnapshot } from "../core/state.js";
import { useAgentComponentController } from "./AgentComponentProvider.js";

/**
 * Registers a component capability and subscribes to its lifecycle snapshot.
 *
 * Use this hook when the {@link AgentComponent} render-prop structure does not fit the component.
 */
export function useAgentComponent<TProps>(
  registration: AgentComponentRegistration<TProps>,
): AgentComponentSnapshot<TProps> {
  const controller = useAgentComponentController();
  const handleRef = useRef<AgentComponentRegistrationHandle<TProps> | null>(null);
  const registeredValueRef = useRef(registration);

  useEffect(() => {
    const handle = controller.register(registration);
    handleRef.current = handle;
    registeredValueRef.current = registration;

    return () => {
      if (handleRef.current === handle) {
        handleRef.current = null;
      }
      handle.unregister();
    };
  }, [controller, registration.id]);

  useEffect(() => {
    if (registeredValueRef.current !== registration) {
      handleRef.current?.update(registration);
      registeredValueRef.current = registration;
    }
  }, [controller, registration]);

  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(registration.id, listener),
    [controller, registration.id],
  );
  const getSnapshot = useCallback(
    () => controller.getSnapshot(registration.id) as AgentComponentSnapshot<TProps>,
    [controller, registration.id],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function getServerSnapshot(): AgentComponentSnapshot<never> {
  return idleSnapshot;
}
