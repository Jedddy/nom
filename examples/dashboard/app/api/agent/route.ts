import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { createAISDKServerTools } from "nom/ai-sdk";
import { z } from "zod";

import {
  agentRequestSchema,
  filterOrdersInputSchema,
  loadSalesInputSchema,
} from "../../../lib/agent-contracts";

const currentDate = tool({
  description:
    "Call this before selecting component tools when a request uses relative dates or omits the year. Do not call it when every requested date includes a year. Returns the current UTC date and time zone.",
  inputSchema: z.object({}),
  execute: () => ({
    date: new Date().toISOString().slice(0, 10),
    timeZone: "UTC",
  }),
});
const defaultTools = { get_current_date: currentDate };

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OpenAI is not configured." }, { status: 503 });
  }

  const payload = await request.json().catch(() => null);
  const parsedRequest = agentRequestSchema.safeParse(payload);

  if (!parsedRequest.success) {
    return Response.json({ error: "The agent request is invalid." }, { status: 400 });
  }

  try {
    const adapter = createAISDKServerTools(parsedRequest.data.manifest, {
      defaultTools,
      resolve: ({ componentId, toolKey }) => {
        if (componentId === "sales-overview" && toolKey === "load-sales") {
          return {
            description:
              "Update aggregate sales metrics for any inclusive calendar date range up to 366 days.",
            inputSchema: loadSalesInputSchema,
            approval: "never",
          };
        }

        if (componentId === "orders-table" && toolKey === "filter-orders") {
          return {
            description:
              "Update individual orders for an optional inclusive date range, status, and customer or order search.",
            inputSchema: filterOrdersInputSchema,
            approval: "never",
          };
        }

        return undefined;
      },
    });

    const openai = createOpenAI({ apiKey });
    const componentToolNames = [...adapter.routing.keys()];
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
      system:
        "Use default context tools when their descriptions require them. Then call every component tool needed to satisfy the complete request, calling each relevant component at most once. Preserve every requested filter, including exact inclusive date ranges in YYYY-MM-DD format. Never invent unavailable data.",
      prompt: parsedRequest.data.prompt,
      tools: adapter.tools,
      toolChoice: "required",
      stopWhen: stepCountIs(4),
      maxOutputTokens: 1_000,
      prepareStep: ({ steps }) =>
        steps.some((step) =>
          step.toolCalls.some((toolCall) => Object.hasOwn(defaultTools, toolCall.toolName)),
        )
          ? { activeTools: componentToolNames }
          : undefined,
    });

    const componentToolCalls = result.steps
      .flatMap((step) => step.toolCalls)
      .filter(({ toolName }) => adapter.routing.has(toolName));

    if (componentToolCalls.length === 0) {
      return Response.json(
        { error: "No component could represent that request." },
        { status: 422 },
      );
    }

    return Response.json({
      toolCalls: componentToolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      })),
    });
  } catch (error) {
    console.error("Agent request failed", error);
    return Response.json({ error: "The model request failed." }, { status: 502 });
  }
}
