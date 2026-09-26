/**
 * Real `ModelClient` implementation, backed by the Anthropic SDK.
 *
 * Translates Anthropic's raw SSE stream (content_block_start/delta/stop,
 * message_delta, message_stop) into the loop's own reduced `ModelStreamEvent`
 * union — this is the ONLY file that needs to know Anthropic's specific
 * event shapes; everything else in src/lib/agent talks the reduced shape.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient, ModelStreamEvent, StreamMessageRequest } from "./model-client";

export class AnthropicModelClient implements ModelClient {
  private readonly client: Anthropic;
  readonly modelName: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.modelName = opts.model;
  }

  async *streamMessage(req: StreamMessageRequest): AsyncIterable<ModelStreamEvent> {
    const stream = this.client.messages.stream({
      model: this.modelName,
      max_tokens: 4096,
      system: req.system,
      // The reduced ModelMessage/ModelContentBlock shapes are structurally
      // compatible with Anthropic's own MessageParam/ContentBlockParam —
      // deliberately, so no translation layer is needed here.
      messages: req.messages as Anthropic.MessageParam[],
      tools: req.tools as Anthropic.Tool[],
    });

    // block index -> {the real tool_use id, its name, its accumulated partial
    // JSON} — Anthropic correlates delta/stop events to a block by POSITIONAL
    // index, not by the tool_use id itself, so the index is the real lookup
    // key here; the id is what every event this method YIELDS is keyed by,
    // since that's the stable identity the rest of the loop cares about.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          if (event.content_block.type === "tool_use") {
            toolBlocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" });
            yield { type: "tool_use_start", id: event.content_block.id, name: event.content_block.name };
          }
          break;
        }
        case "content_block_delta": {
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta.type === "input_json_delta") {
            const block = toolBlocks.get(event.index);
            if (block) {
              block.json += event.delta.partial_json;
              yield { type: "tool_use_input_delta", id: block.id, partialJson: event.delta.partial_json };
            }
          }
          break;
        }
        case "content_block_stop": {
          const block = toolBlocks.get(event.index);
          if (block) {
            let input: unknown = {};
            try {
              input = block.json ? JSON.parse(block.json) : {};
            } catch {
              // Malformed JSON from the model — surfaced as an empty object,
              // which the tool's OWN Zod schema will then reject cleanly
              // rather than this layer trying to guess intent.
              input = {};
            }
            yield { type: "tool_use_end", id: block.id, name: block.name, input };
            toolBlocks.delete(event.index);
          }
          break;
        }
        case "message_delta": {
          if (event.delta.stop_reason) {
            const stopReason =
              event.delta.stop_reason === "end_turn" || event.delta.stop_reason === "tool_use" || event.delta.stop_reason === "max_tokens"
                ? event.delta.stop_reason
                : "other";
            yield {
              type: "message_stop",
              stopReason,
              usage: {
                inputTokens: event.usage?.input_tokens ?? 0,
                outputTokens: event.usage?.output_tokens ?? 0,
              },
            };
          }
          break;
        }
        default:
          break;
      }
    }
  }
}
