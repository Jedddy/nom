import { type AgentComponentResult, defineAgentTool } from "@nom-ai/sdk";

import {
  type DeliverySummaryResult,
  type ShipmentsResult,
  deliverySummaryResultSchema,
  loadArchivedShipmentsInputSchema,
  loadDeliverySummaryInputSchema,
  loadShipmentsInputSchema,
  shipmentsResultSchema,
} from "./agent-contracts";
import { currentAgentFault } from "./lab-controls";

export const SHIPMENTS_COMPONENT_ID = "shipments-table";
export const DELIVERY_SUMMARY_COMPONENT_ID = "delivery-summary";

/**
 * Loads shipments for the selected status.
 *
 * The `fault` query parameter is host-owned and never appears in the input schema, so the
 * model cannot request a broken response. See `lib/lab-controls.ts`.
 */
export const loadShipments = defineAgentTool({
  key: "load-shipments",
  description:
    "Load shipments for a status, optionally filtered by destination or shipment number.",
  inputSchema: loadShipmentsInputSchema,
  outputSchema: shipmentsResultSchema,
  async execute({ status, search }, { signal }) {
    const query = new URLSearchParams({ status, fault: currentAgentFault() });
    if (search) query.set("search", search);

    const response = await fetch(`/api/shipments?${query}`, { signal });
    if (!response.ok) throw new Error("Shipments could not be loaded.");
    return response.json();
  },
  mapOutput(output): AgentComponentResult<ShipmentsResult> {
    // A mapper that throws is indistinguishable from a failed schema at the render
    // boundary, which is exactly the diagnosis the timeline makes reachable.
    if (currentAgentFault() === "mapping-failure") {
      throw new Error("The shipment mapper could not read the response.");
    }

    return output.shipments.length === 0
      ? { status: "empty" }
      : { status: "success", props: output };
  },
  // Deliberately narrow: the model learns how many shipments loaded, not their contents.
  projectModelOutput(output) {
    return {
      type: "text",
      value: `Loaded ${output.shipments.length} shipments for ${output.rangeLabel}.`,
    };
  },
});

/**
 * Reads closed-out shipments from the archive.
 *
 * `approval: "required"` routes it through the controller's `authorize` policy, so the lab
 * can produce an `authorization-denied` terminal without a failing data source. It also
 * executes locally rather than over the network, which is the shape a tool takes when the
 * data is already in the browser.
 */
export const loadArchivedShipments = defineAgentTool({
  key: "load-archived-shipments",
  description: "Load shipments that were closed out in the last quarter or the last year.",
  inputSchema: loadArchivedShipmentsInputSchema,
  outputSchema: shipmentsResultSchema,
  approval: "required",
  execute({ since }): ShipmentsResult {
    return {
      rangeLabel: since === "quarter" ? "Archived this quarter" : "Archived this year",
      shipments: [
        {
          id: "SHP-4611",
          destination: "Gothenburg",
          carrier: "Southline",
          status: "delivered",
          etaLabel: "Jun 18",
        },
        {
          id: "SHP-4590",
          destination: "Busan",
          carrier: "Blue Harbor",
          status: "delivered",
          etaLabel: "Jun 4",
        },
      ],
    };
  },
  mapOutput(output): AgentComponentResult<ShipmentsResult> {
    return output.shipments.length === 0
      ? { status: "empty" }
      : { status: "success", props: output };
  },
});

export const loadDeliverySummary = defineAgentTool({
  key: "load-delivery-summary",
  description: "Load on-time delivery rates for today, the current week, or the current month.",
  inputSchema: loadDeliverySummaryInputSchema,
  outputSchema: deliverySummaryResultSchema,
  async execute({ window }, { signal }) {
    const query = new URLSearchParams({ window, fault: currentAgentFault() });
    const response = await fetch(`/api/delivery-summary?${query}`, { signal });
    if (!response.ok) throw new Error("The delivery summary could not be loaded.");
    return response.json();
  },
  mapOutput(output): AgentComponentResult<DeliverySummaryResult> {
    return { status: "success", props: output };
  },
});

export const shipmentsTools = [loadShipments, loadArchivedShipments];
export const deliverySummaryTools = [loadDeliverySummary];
