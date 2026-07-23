import { expect, test } from "bun:test";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { DynamicToolUIPart, UIMessage } from "ai";

import type { AISDKAddToolOutput, AISDKClientToolPart } from "../../src/ai-sdk/index.js";

test("matches stable AI SDK 6 UI callback shapes", () => {
  type ChatOutput = UseChatHelpers<UIMessage>["addToolOutput"];
  type PartCompatible = DynamicToolUIPart extends AISDKClientToolPart ? true : false;

  const partCompatible: PartCompatible = true;
  const callbackAdapter =
    (callback: ChatOutput): AISDKAddToolOutput =>
    (output) =>
      callback(output);

  expect(partCompatible).toBe(true);
  expect(typeof callbackAdapter).toBe("function");
});
