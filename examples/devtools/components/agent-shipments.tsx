"use client";

import { CircleAlertIcon, PackageIcon } from "lucide-react";
import { AgentComponent } from "@nom-ai/sdk";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DeliverySummaryResult, ShipmentsResult } from "../lib/agent-contracts";
import {
  DELIVERY_SUMMARY_COMPONENT_ID,
  SHIPMENTS_COMPONENT_ID,
  deliverySummaryTools,
  shipmentsTools,
} from "../lib/agent-tools";

const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const initialShipments: ShipmentsResult = {
  rangeLabel: "Open shipments",
  shipments: [
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
      id: "SHP-4820",
      destination: "Lisbon",
      carrier: "Meridian Freight",
      status: "delivered",
      etaLabel: "Aug 2",
    },
  ],
};

export function AgentShipmentsTable() {
  return (
    <AgentComponent<ShipmentsResult>
      id={SHIPMENTS_COMPONENT_ID}
      instructions="Use this component to list, filter, or search active shipments, and to read closed-out shipments from the archive."
      tools={shipmentsTools}
    >
      {(snapshot) => {
        // A loading snapshot that carries `previousProps` is the sanctioned way to show
        // prior content during a refetch. The panel labels it as prior content rather than
        // as stale data, which is the difference this branch makes visible.
        if (snapshot.status === "loading") {
          return snapshot.previousProps ? (
            <ShipmentsCard data={snapshot.previousProps} isRefreshing />
          ) : (
            <ShipmentsSkeleton />
          );
        }

        if (snapshot.status === "failure") {
          return (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Shipments could not be loaded</AlertTitle>
              <AlertDescription>
                {snapshot.error.message} Code: <code>{snapshot.error.code}</code>. Open the panel to
                see which stage rejected the request.
              </AlertDescription>
            </Alert>
          );
        }

        if (snapshot.status === "empty") {
          return (
            <Card>
              <CardContent>
                <Empty>
                  <EmptyMedia variant="icon">
                    <PackageIcon />
                  </EmptyMedia>
                  <EmptyTitle>No shipments</EmptyTitle>
                  <EmptyDescription>
                    The tool ran and mapped its result to no data. That is a mapper decision, not a
                    failure — the timeline shows it as an empty terminal.
                  </EmptyDescription>
                </Empty>
              </CardContent>
            </Card>
          );
        }

        return (
          <ShipmentsCard
            data={snapshot.status === "success" ? snapshot.props : initialShipments}
            isRefreshing={false}
          />
        );
      }}
    </AgentComponent>
  );
}

export function AgentDeliverySummary() {
  return (
    <AgentComponent<DeliverySummaryResult>
      id={DELIVERY_SUMMARY_COMPONENT_ID}
      instructions="Use this component for aggregate on-time delivery rates over today, the week, or the month."
      tools={deliverySummaryTools}
    >
      {(snapshot) => {
        if (snapshot.status === "loading" && !snapshot.previousProps) {
          return <SummarySkeleton />;
        }

        if (snapshot.status === "failure") {
          return (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Delivery summary unavailable</AlertTitle>
              <AlertDescription>
                {snapshot.error.message} Code: <code>{snapshot.error.code}</code>.
              </AlertDescription>
            </Alert>
          );
        }

        const data =
          snapshot.status === "success"
            ? snapshot.props
            : snapshot.status === "loading"
              ? snapshot.previousProps
              : undefined;

        if (!data) {
          return <SummaryCard label="Nothing loaded yet" />;
        }

        return (
          <SummaryCard
            label={data.windowLabel}
            onTimeRate={data.onTimeRate}
            delivered={data.delivered}
            delayed={data.delayed}
            isRefreshing={snapshot.status === "loading"}
          />
        );
      }}
    </AgentComponent>
  );
}

function ShipmentsCard({
  data,
  isRefreshing,
}: {
  readonly data: ShipmentsResult;
  readonly isRefreshing: boolean;
}) {
  return (
    <Card aria-busy={isRefreshing || undefined}>
      <CardHeader>
        <CardTitle>Shipments</CardTitle>
        <CardDescription>{data.rangeLabel}</CardDescription>
        <CardAction>
          {isRefreshing ? (
            <Badge variant="outline">
              <Spinner data-icon="inline-start" />
              Showing prior content
            </Badge>
          ) : (
            <Badge variant="secondary">{data.shipments.length} shipments</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className={isRefreshing ? "opacity-60" : undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shipment</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Carrier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">ETA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.shipments.map((shipment) => (
              <TableRow key={shipment.id}>
                <TableCell className="font-medium">{shipment.id}</TableCell>
                <TableCell>{shipment.destination}</TableCell>
                <TableCell>{shipment.carrier}</TableCell>
                <TableCell>
                  <Badge variant={shipment.status === "delayed" ? "destructive" : "outline"}>
                    {shipment.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{shipment.etaLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  onTimeRate,
  delivered,
  delayed,
  isRefreshing,
}: {
  readonly label: string;
  readonly onTimeRate?: number;
  readonly delivered?: number;
  readonly delayed?: number;
  readonly isRefreshing?: boolean;
}) {
  return (
    <Card size="sm" aria-busy={isRefreshing || undefined}>
      <CardHeader>
        <CardDescription>On-time delivery</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          {onTimeRate === undefined ? "—" : percent.format(onTimeRate)}
        </CardTitle>
        <CardAction>
          <Badge variant={isRefreshing ? "outline" : "secondary"}>
            {isRefreshing ? <Spinner data-icon="inline-start" /> : null}
            {label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex gap-6 text-xs text-muted-foreground">
        <span>{delivered ?? 0} delivered</span>
        <span>{delayed ?? 0} delayed</span>
      </CardContent>
    </Card>
  );
}

function ShipmentsSkeleton() {
  return (
    <Card aria-label="Loading shipments" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <Card size="sm" aria-label="Loading delivery summary" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}
