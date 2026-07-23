const core = await import("@nom-ai/sdk/core");

if (typeof core.AgentComponentController !== "function") {
  throw new Error("@nom-ai/sdk/core did not expose the controller.");
}

let adapterFailedWithoutPeer = false;
try {
  await import("@nom-ai/sdk/ai-sdk");
} catch {
  adapterFailedWithoutPeer = true;
}

if (!adapterFailedWithoutPeer) {
  throw new Error("@nom-ai/sdk/ai-sdk unexpectedly loaded without its optional AI SDK peer.");
}

console.log("Core-only ESM import passed without React or AI SDK.");
