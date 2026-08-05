/**
 * Stacking order for the devtools container in the host document.
 *
 * Close to the 32-bit signed maximum so the panel stays above host overlays, and a few
 * thousand below it so a host that genuinely needs to cover the panel still can.
 */
export const DEVTOOLS_STACKING_ORDER = "2147483000";

/** Smallest drawer height, in pixels, that still shows a timeline row and its detail. */
export const MIN_DRAWER_HEIGHT = 180;

/** Drawer height, in pixels, used before the developer resizes it. */
export const DEFAULT_DRAWER_HEIGHT = 320;

/**
 * Stylesheet injected inside the panel's shadow root.
 *
 * The package ships no CSS file and the panel mounts into arbitrary host applications, so
 * per KTD6 every rule lives here and applies only within the shadow root. Nothing here
 * leaks out, and nothing from the host leaks in beyond inherited-by-default properties,
 * which the `:host` and `.nom-devtools` resets override.
 */
export const DEVTOOLS_STYLES = `
:host {
  all: initial;
}

.nom-devtools {
  position: fixed;
  inset: 0;
  pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 12px;
  line-height: 1.45;
  color: #e6e8ee;
  text-align: left;
  letter-spacing: normal;
  color-scheme: dark;
}

.nom-devtools *,
.nom-devtools *::before,
.nom-devtools *::after {
  box-sizing: border-box;
}

.nom-devtools button {
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  margin: 0;
  padding: 0;
  cursor: pointer;
}

.nom-devtools h2,
.nom-devtools h3,
.nom-devtools h4,
.nom-devtools p,
.nom-devtools dl,
.nom-devtools dd,
.nom-devtools ol,
.nom-devtools ul {
  margin: 0;
  padding: 0;
}

.nom-devtools ol,
.nom-devtools ul {
  list-style: none;
}

.nom-launcher {
  position: absolute;
  right: 16px;
  bottom: 16px;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: #14161c;
  border: 1px solid #333844;
  box-shadow: 0 6px 20px rgb(0 0 0 / 35%);
}

.nom-launcher:focus-visible {
  outline: 2px solid #6ea8fe;
  outline-offset: 2px;
}

.nom-launcher-count {
  color: #a4abbb;
}

.nom-launcher-failures {
  color: #ffb4b4;
}

.nom-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  min-height: ${MIN_DRAWER_HEIGHT}px;
  max-height: 90vh;
  background: #0f1116;
  border-top: 1px solid #333844;
  box-shadow: 0 -8px 28px rgb(0 0 0 / 45%);
}

.nom-resize {
  height: 8px;
  flex: none;
  cursor: ns-resize;
  background: #1a1d25;
  border-bottom: 1px solid #262b36;
}

.nom-resize:focus-visible {
  outline: 2px solid #6ea8fe;
  outline-offset: -2px;
}

.nom-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #262b36;
}

.nom-title {
  font-size: 12px;
  font-weight: 600;
}

.nom-payload-mode {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #333844;
  color: #a4abbb;
}

.nom-payload-mode-verbatim {
  color: #ffd6a0;
  border-color: #6b5322;
}

.nom-close {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #333844;
}

.nom-tablist {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 6px 12px 0;
  border-bottom: 1px solid #262b36;
}

.nom-tab {
  padding: 4px 10px;
  border-radius: 6px 6px 0 0;
  border: 1px solid transparent;
  color: #a4abbb;
}

.nom-tab[aria-selected="true"] {
  color: #e6e8ee;
  border-color: #333844;
  border-bottom-color: #0f1116;
  background: #161922;
}

.nom-tabpanel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
}

.nom-empty {
  color: #a4abbb;
  max-width: 60ch;
}

.nom-empty code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6e8ee;
}

.nom-timeline {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.nom-timeline-list {
  flex: 1 1 55%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nom-row {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid #262b36;
  background: #14161c;
}

.nom-row[aria-pressed="true"] {
  border-color: #6ea8fe;
}

.nom-row:focus-visible {
  outline: 2px solid #6ea8fe;
  outline-offset: 1px;
}

.nom-row-title {
  font-weight: 600;
}

.nom-badge {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid #333844;
  color: #a4abbb;
}

.nom-badge-succeeded {
  color: #a7e8bd;
}

.nom-badge-failed {
  color: #ffb4b4;
}

.nom-badge-superseded {
  color: #c9b6ff;
}

.nom-chip {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px dashed #4a5262;
  color: #a4abbb;
}

.nom-row-stages {
  flex: 1 0 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: #8d95a6;
}

.nom-detail {
  flex: 1 1 45%;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #262b36;
  background: #14161c;
}

.nom-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.nom-detail-title {
  font-size: 12px;
  font-weight: 600;
}

.nom-detail-close {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #333844;
}

.nom-detail-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 10px;
  margin-bottom: 8px;
}

.nom-detail-meta dt {
  color: #8d95a6;
}

.nom-section-title {
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0 2px;
}

.nom-payload {
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #0b0d12;
  border: 1px solid #262b36;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}

.nom-muted {
  color: #8d95a6;
}

.nom-manifest-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.nom-manifest-component {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #262b36;
  background: #14161c;
}

.nom-manifest-id {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.nom-manifest-tool {
  margin-top: 8px;
  padding-left: 10px;
  border-left: 2px solid #262b36;
}

.nom-manifest-tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nom-manifest-tool-header .nom-section-title {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.nom-approval-never {
  color: #a4abbb;
}

.nom-approval-required {
  color: #ffd6a0;
  border-color: #6b5322;
}

.nom-manifest-description {
  color: #c4cad6;
}

.nom-manifest-schema-title {
  margin-top: 6px;
  color: #8d95a6;
}

.nom-manifest-fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 10px;
  margin: 2px 0 6px;
}

.nom-manifest-fields dt {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6e8ee;
}

.nom-manifest-type {
  color: #a7e8bd;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.nom-mock {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 72ch;
}

.nom-mock-targets {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.nom-mock-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 180px;
}

.nom-mock-label {
  color: #8d95a6;
}

.nom-mock-select,
.nom-mock-output {
  font: inherit;
  color: #e6e8ee;
  background: #0b0d12;
  border: 1px solid #333844;
  border-radius: 6px;
  padding: 4px 6px;
}

.nom-mock-output {
  width: 100%;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.nom-mock-select:focus-visible,
.nom-mock-output:focus-visible,
.nom-mock-apply:focus-visible {
  outline: 2px solid #6ea8fe;
  outline-offset: 1px;
}

.nom-mock-select:disabled,
.nom-mock-apply:disabled {
  color: #8d95a6;
  cursor: not-allowed;
}

.nom-mock-error {
  color: #ffb4b4;
}

.nom-mock-actions {
  display: flex;
}

.nom-mock-apply {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid #333844;
  background: #161922;
}
`;
