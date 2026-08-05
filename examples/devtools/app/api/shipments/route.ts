import "server-only";

const shipments = [
  {
    id: "SHP-4831",
    destination: "Rotterdam",
    carrier: "Meridian Freight",
    status: "in-transit",
    etaLabel: "Aug 7",
  },
  {
    id: "SHP-4829",
    destination: "Osaka",
    carrier: "Blue Harbor",
    status: "delayed",
    etaLabel: "Aug 9",
  },
  {
    id: "SHP-4826",
    destination: "Valparaíso",
    carrier: "Southline",
    status: "delayed",
    etaLabel: "Aug 11",
  },
  {
    id: "SHP-4820",
    destination: "Lisbon",
    carrier: "Meridian Freight",
    status: "delivered",
    etaLabel: "Aug 2",
  },
];

const statusLabels: Record<string, string> = {
  all: "All shipments",
  "in-transit": "Shipments in transit",
  delayed: "Delayed shipments",
  delivered: "Delivered shipments",
};

/**
 * The lab's data source.
 *
 * `fault` is host-owned and never part of the tool's input schema — the model cannot ask
 * for a broken response. Replace this route with your own data layer; the faults exist so
 * the timeline has something to explain.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fault = url.searchParams.get("fault") ?? "none";
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("search")?.toLowerCase();

  if (fault === "slow") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  if (fault === "execution-failure") {
    return Response.json({ error: "The shipment service is unavailable." }, { status: 503 });
  }

  if (fault === "invalid-output") {
    // Well-formed JSON that the output schema refuses: the timeline reports the rejecting
    // stage and the issue paths, and never the rejected values.
    return Response.json({
      rangeLabel: 7,
      shipments: [{ id: 4831, destination: null, carrier: "Meridian Freight" }],
    });
  }

  const matched =
    fault === "empty"
      ? []
      : shipments.filter((shipment) => {
          if (status !== "all" && shipment.status !== status) return false;
          if (!search) return true;
          return (
            shipment.destination.toLowerCase().includes(search) ||
            shipment.id.toLowerCase().includes(search)
          );
        });

  return Response.json({
    rangeLabel: statusLabels[status] ?? "Shipments",
    shipments: matched,
  });
}
