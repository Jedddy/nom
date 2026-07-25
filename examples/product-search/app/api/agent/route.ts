import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createAISDKServerTools } from "@nom-ai/sdk/ai-sdk";

import { agentRequestSchema, searchProductsInputSchema } from "../../../lib/agent-contracts";

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
      resolve: ({ componentId, toolKey }) => {
        if (componentId !== "product-results" || toolKey !== "search-products") {
          return undefined;
        }

        return {
          description:
            "Search and display products by name, category, feature, budget, and availability. Use this whenever the user asks to find, browse, compare, or filter products.",
          inputSchema: searchProductsInputSchema,
          approval: "never",
        };
      },
    });

    const openai = createOpenAI({ apiKey });
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
      system:
        "Call the mounted product search tool exactly once. Preserve the user's keywords, budget, and availability requirements. Do not invent product results.",
      prompt: parsedRequest.data.prompt,
      tools: adapter.tools,
      toolChoice: "required",
      maxOutputTokens: 400,
    });

    const componentToolCalls = result.toolCalls.filter(({ toolName }) =>
      adapter.routing.has(toolName),
    );

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
    console.error("Product search request failed", error);
    return Response.json({ error: "The model request failed." }, { status: 502 });
  }
}
