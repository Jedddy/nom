import "server-only";

const windows: Record<
  string,
  { windowLabel: string; onTimeRate: number; delivered: number; delayed: number }
> = {
  today: { windowLabel: "Today", onTimeRate: 0.941, delivered: 34, delayed: 2 },
  week: { windowLabel: "This week", onTimeRate: 0.918, delivered: 214, delayed: 19 },
  month: { windowLabel: "This month", onTimeRate: 0.903, delivered: 872, delayed: 94 },
};

/** Second data source, so the timeline spans more than one component id. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fault = url.searchParams.get("fault") ?? "none";
  const window = url.searchParams.get("window") ?? "week";

  if (fault === "slow") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  if (fault === "execution-failure") {
    return Response.json({ error: "The delivery service is unavailable." }, { status: 503 });
  }

  return Response.json(windows[window] ?? windows.week);
}
