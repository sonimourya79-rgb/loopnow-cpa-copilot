/**
 * Picks the real Anthropic client when a real API key is configured, or the
 * scripted MockModelClient otherwise — so the whole app is runnable and
 * demoable with zero external credentials, never silently degraded without
 * saying so. Every mock-mode response is labeled in both server logs and the
 * event stream (see mock-client.ts's final message) so it can never be
 * mistaken for a real model run by whoever's reviewing it.
 */
import { AnthropicModelClient } from "./anthropic-client";
import { MockModelClient } from "./mock-client";
import type { ModelClient } from "./model-client";

function hasRealApiKey(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key !== "sk-ant-placeholder" && key.startsWith("sk-ant-");
}

export function getModelClient(opts: { receiptId: string }): { client: ModelClient; isMockMode: boolean } {
  if (hasRealApiKey()) {
    return {
      client: new AnthropicModelClient({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      }),
      isMockMode: false,
    };
  }

  console.warn(
    "[agent] No real ANTHROPIC_API_KEY configured — running in TEST/MOCK MODE. " +
    "Tool calls and database writes are real; the model's reasoning is scripted.",
  );
  return { client: new MockModelClient({ receiptId: opts.receiptId }), isMockMode: true };
}
