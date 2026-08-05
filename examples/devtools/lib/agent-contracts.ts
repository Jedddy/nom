import { z } from "zod";

export const shipmentStatusSchema = z.enum(["in-transit", "delayed", "delivered"]);

export const loadShipmentsInputSchema = z.object({
  status: z
    .enum(["all", "in-transit", "delayed", "delivered"])
    .describe("The shipment status to display."),
  search: z
    .string()
    .max(80)
    .optional()
    .describe("An optional destination or shipment number to search for."),
});

export const loadArchivedShipmentsInputSchema = z.object({
  since: z
    .enum(["quarter", "year"])
    .describe("How far back the archive should be read: the last quarter or the last year."),
});

export const loadDeliverySummaryInputSchema = z.object({
  window: z
    .enum(["today", "week", "month"])
    .describe("The delivery window the summary should cover."),
});

export const shipmentSchema = z.object({
  id: z.string(),
  destination: z.string(),
  carrier: z.string(),
  status: shipmentStatusSchema,
  etaLabel: z.string(),
});

export const shipmentsResultSchema = z.object({
  rangeLabel: z.string(),
  shipments: z.array(shipmentSchema),
});

export const deliverySummaryResultSchema = z.object({
  windowLabel: z.string(),
  onTimeRate: z.number(),
  delivered: z.number().int(),
  delayed: z.number().int(),
});

export type Shipment = z.infer<typeof shipmentSchema>;
export type ShipmentsResult = z.infer<typeof shipmentsResultSchema>;
export type DeliverySummaryResult = z.infer<typeof deliverySummaryResultSchema>;
