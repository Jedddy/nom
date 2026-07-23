import { describe, expect, mock, test } from "bun:test";

import { AgentComponentController } from "../../src/core/index.js";
import { AISDKClientBridge, createAIToolRouting } from "../../src/ai-sdk/index.js";
import { testRegistration } from "../helpers/component.js";

function setupBridge() {
  const execute = mock(async ({ query }: { readonly query: string }) => [query]);
  const controller = new AgentComponentController();
  controller.register(testRegistration("products", { execute }));
  const routing = createAIToolRouting({
    version: 1,
    components: [{ id: "products", tools: [{ key: "load-items" }] }],
  });
  const [toolName] = routing.keys();
  const bridge = new AISDKClientBridge({ chatId: "chat-1", controller, routing });
  return { bridge, controller, execute, toolName: toolName! };
}

describe("AISDKClientBridge", () => {
  test("executes a forwarded client tool and returns only a receipt", async () => {
    const { bridge, controller, toolName } = setupBridge();
    const addToolOutput = mock(async () => undefined);

    await bridge.handleToolCall(
      { toolName, toolCallId: "call-1", input: { query: "Keyboard" } },
      addToolOutput,
    );

    expect(controller.getSnapshot("products")).toMatchObject({
      status: "success",
      props: { items: ["Keyboard"] },
    });
    expect(addToolOutput).toHaveBeenCalledWith({
      tool: toolName,
      toolCallId: "call-1",
      output: { status: "applied" },
    });
  });

  test("deduplicates exact replay and fails closed on conflicting replay", async () => {
    const { bridge, execute, toolName } = setupBridge();
    const addToolOutput = mock(async () => undefined);
    const call = { toolName, toolCallId: "call-1", input: { query: "Keyboard" } };

    await bridge.handleToolCall(call, addToolOutput);
    await bridge.handleToolCall(call, addToolOutput);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(addToolOutput).toHaveBeenCalledTimes(1);

    await expect(
      bridge.handleToolCall({ ...call, input: { query: "Conflicting input" } }, addToolOutput),
    ).rejects.toMatchObject({ code: "adapter-failed" });
  });

  test("maps server output through the browser registration", async () => {
    const { bridge, controller, toolName } = setupBridge();

    await bridge.applyToolPart({
      toolName,
      toolCallId: "server-call",
      state: "input-available",
      input: { query: "Server" },
    });
    expect(controller.getSnapshot("products").status).toBe("loading");

    await bridge.applyToolPart({
      toolName,
      toolCallId: "server-call",
      state: "output-available",
      input: { query: "Server" },
      output: ["Server result"],
    });
    expect(controller.getSnapshot("products")).toMatchObject({
      status: "success",
      props: { items: ["Server result"] },
    });
  });

  test("turns denied and error parts into redacted typed failures", async () => {
    const denied = setupBridge();
    await denied.bridge.applyToolPart({
      toolName: denied.toolName,
      toolCallId: "denied-call",
      state: "output-denied",
      input: { query: "Denied" },
      approval: { id: "approval-1", approved: false },
    });
    expect(denied.controller.getSnapshot("products")).toMatchObject({
      status: "failure",
      error: { code: "authorization-denied" },
    });

    const failed = setupBridge();
    await failed.bridge.applyToolPart({
      toolName: failed.toolName,
      toolCallId: "failed-call",
      state: "output-error",
      input: { query: "Failed" },
      errorText: "private server detail",
    });
    expect(failed.controller.getSnapshot("products")).toMatchObject({
      status: "failure",
      error: {
        code: "adapter-failed",
        message: "The AI adapter could not apply the request.",
      },
    });
  });

  test("rejects conflicting terminal states for one tool call", async () => {
    const { bridge, toolName } = setupBridge();
    await bridge.applyToolPart({
      toolName,
      toolCallId: "terminal-call",
      state: "output-denied",
      input: { query: "Denied" },
      approval: { id: "approval-2", approved: false },
    });

    await expect(
      bridge.applyToolPart({
        toolName,
        toolCallId: "terminal-call",
        state: "output-available",
        input: { query: "Denied" },
        output: ["Unexpected result"],
      }),
    ).rejects.toMatchObject({ code: "adapter-failed" });
  });
});
