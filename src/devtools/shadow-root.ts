import { DEVTOOLS_STACKING_ORDER, DEVTOOLS_STYLES } from "./styles.js";

/**
 * Marker attribute on the document-level container that carries the panel's shadow root.
 *
 * Tests and host tooling use it to find the container; nothing in the panel reads it.
 */
export const DEVTOOLS_CONTAINER_ATTRIBUTE = "data-nom-devtools";

/** A mounted devtools container and the shadow root the panel renders into. */
export interface AgentDevtoolsShadowHost {
  /** The element appended to `document.body`; the shadow root's host. */
  readonly container: HTMLElement;
  /** The open shadow root the panel portals into. */
  readonly root: ShadowRoot;
  /** Detaches the container from the document. */
  readonly dispose: () => void;
}

/**
 * Creates the document-level container, attaches an open shadow root, and injects styles.
 *
 * Per KTD6 the panel renders inside a shadow root so it neither ships a stylesheet nor
 * inherits host styles. The root is `open` so tests and host tooling can reach into it.
 * The container itself is styled inline, because rules inside the shadow root cannot
 * reliably position the host element across host stylesheets.
 *
 * Returns `null` when the environment provides no `attachShadow`, in which case the panel
 * renders nothing rather than falling back to a style-leaking inline render.
 *
 * @param ownerDocument - The document to mount into; never touched during server render.
 */
export function createDevtoolsShadowHost(ownerDocument: Document): AgentDevtoolsShadowHost | null {
  const container = ownerDocument.createElement("div");
  container.setAttribute(DEVTOOLS_CONTAINER_ATTRIBUTE, "");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "0";
  container.style.height = "0";
  container.style.zIndex = DEVTOOLS_STACKING_ORDER;

  if (typeof container.attachShadow !== "function") {
    return null;
  }

  const root = container.attachShadow({ mode: "open" });
  const style = ownerDocument.createElement("style");
  style.textContent = DEVTOOLS_STYLES;
  root.append(style);
  ownerDocument.body.append(container);

  return {
    container,
    root,
    dispose: () => {
      container.remove();
    },
  };
}
