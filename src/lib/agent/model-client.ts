/**
 * The model client abstraction the agent loop is written against — never
 * the raw `@anthropic-ai/sdk` client directly.
 *
 * Two reasons this boundary exists, not just one:
 *   1. Testability. The loop's actual logic (execute tools, feed results
 *      back, stop when the model is done, record observability data) is
 *      control flow that has nothing to do with which LLM answers it. A
 *      fake client that yields a scripted event sequence tests that control
 *      flow for real, with no network call and no API key — see
 *      __tests__/loop.test.ts. A test that mocked the LOOP itself instead
 *      would be exactly the "fake tool calls simulated only" penalty this
 *      assessment names.
 *   2. Multi-model fallback (a named bonus feature) is "swap the
 *      implementation behind this interface," not a rewrite of the loop.
 */

export interface ModelMessage {
  role: "user" | "assistant";
  content: string | ModelContentBlock[];
}

export type ModelContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ModelToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface StreamMessageRequest {
  system: string;
  messages: ModelMessage[];
  tools: ModelToolSpec[];
}

/** One event out of the underlying model's stream, reduced to what the loop actually needs. */
export type ModelStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_input_delta"; id: string; partialJson: string }
  | { type: "tool_use_end"; id: string; name: string; input: unknown }
  | { type: "message_stop"; stopReason: "end_turn" | "tool_use" | "max_tokens" | "other"; usage: { inputTokens: number; outputTokens: number } };

export interface ModelClient {
  readonly modelName: string;
  streamMessage(req: StreamMessageRequest): AsyncIterable<ModelStreamEvent>;
}
