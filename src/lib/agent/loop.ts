/**
 * The agent loop — reads a receipt, calls tools in sequence, streams
 * progress out, and stops itself once the model has nothing left to do (or
 * a safety cap is hit). This file owns exactly the orchestration: it never
 * computes a dollar amount, never decides a GIFI code, and never writes to
 * `Expense`/`Approval` directly — all of that is the tool layer's job,
 * called through `executeTool` like any other caller.
 */
import { prisma } from "@/lib/db";
import { ALL_TOOLS, TOOLS_BY_NAME, executeTool, toolsForAnthropic } from "@/lib/tools";
import { SYSTEM_PROMPT } from "./system-prompt";
import type { ModelClient, ModelMessage, ModelContentBlock } from "./model-client";

export type AgentLoopEvent =
  | { type: "run_started"; agentRunId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolName: string; input: unknown }
  | { type: "tool_call_result"; toolName: string; succeeded: boolean; output: unknown; errorMessage: string | null }
  | { type: "run_completed"; agentRunId: string; stopReason: string }
  | { type: "run_error"; message: string };

const MAX_ITERATIONS = 8;

export interface RunAgentOptions {
  /** The Expense row this run is FOR — every AgentRun belongs to exactly one. */
  expenseId: string;
  userMessage: string;
  modelClient: ModelClient;
}

export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentLoopEvent> {
  const { expenseId, userMessage, modelClient } = opts;

  const agentRun = await prisma.agentRun.create({
    data: { expenseId, status: "running", model: modelClient.modelName },
  });
  yield { type: "run_started", agentRunId: agentRun.id };

  const loopStartedAt = performance.now();
  let ttftMs: number | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const messages: ModelMessage[] = [{ role: "user", content: userMessage }];

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let assistantText = "";
      const pendingToolUses: { id: string; name: string; input: unknown }[] = [];
      let stopReason = "other";

      for await (const event of modelClient.streamMessage({
        system: SYSTEM_PROMPT,
        messages,
        tools: toolsForAnthropic(),
      })) {
        if (ttftMs === null) ttftMs = performance.now() - loopStartedAt;

        switch (event.type) {
          case "text_delta":
            assistantText += event.text;
            yield { type: "text_delta", text: event.text };
            break;
          case "tool_use_end":
            pendingToolUses.push({ id: event.id, name: event.name, input: event.input });
            break;
          case "message_stop":
            stopReason = event.stopReason;
            totalInputTokens += event.usage.inputTokens;
            totalOutputTokens += event.usage.outputTokens;
            break;
          default:
            break;
        }
      }

      // Record the assistant's turn (text + any tool_use blocks) before
      // deciding what happens next — the transcript must be exactly what the
      // model actually said, whether or not any tool call follows it.
      const assistantContent: ModelContentBlock[] = [];
      if (assistantText) assistantContent.push({ type: "text", text: assistantText });
      for (const t of pendingToolUses) {
        assistantContent.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
      }
      if (assistantContent.length > 0) {
        messages.push({ role: "assistant", content: assistantContent });
      }

      if (stopReason !== "tool_use" || pendingToolUses.length === 0) {
        await completeRun(agentRun.id, "completed", { ttftMs, loopStartedAt, totalInputTokens, totalOutputTokens });
        yield { type: "run_completed", agentRunId: agentRun.id, stopReason };
        return;
      }

      // Execute every requested tool call for real, through the same
      // executeTool() harness any other caller uses — no shortcut here.
      const toolResultBlocks: ModelContentBlock[] = [];
      for (const call of pendingToolUses) {
        yield { type: "tool_call_start", toolName: call.name, input: call.input };

        const tool = TOOLS_BY_NAME.get(call.name);
        const startedAt = new Date();
        const result = tool
          ? await executeTool(tool, call.input)
          : {
              toolName: call.name,
              input: call.input,
              output: null,
              succeeded: false,
              errorMessage: `Unknown tool '${call.name}'`,
              latencyMs: 0,
            };

        await prisma.toolCall.create({
          data: {
            agentRunId: agentRun.id,
            toolName: call.name,
            input: call.input as object,
            output: result.succeeded ? (result.output as object) : undefined,
            succeeded: result.succeeded,
            errorMessage: result.errorMessage,
            latencyMs: Math.round(result.latencyMs),
            startedAt,
          },
        });

        yield {
          type: "tool_call_result",
          toolName: call.name,
          succeeded: result.succeeded,
          output: result.output,
          errorMessage: result.errorMessage,
        };

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(result.succeeded ? result.output : { error: result.errorMessage }),
          is_error: !result.succeeded,
        });
      }

      messages.push({ role: "user", content: toolResultBlocks });
    }

    // Hit MAX_ITERATIONS without the model settling — a real failure mode
    // (an agent stuck calling tools forever), not silently swallowed.
    await completeRun(agentRun.id, "failed", {
      ttftMs,
      loopStartedAt,
      totalInputTokens,
      totalOutputTokens,
      errorMessage: `Exceeded ${MAX_ITERATIONS} tool-call iterations without completing`,
    });
    yield { type: "run_error", message: `Agent exceeded ${MAX_ITERATIONS} iterations without completing` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    await completeRun(agentRun.id, "failed", { ttftMs, loopStartedAt, totalInputTokens, totalOutputTokens, errorMessage: message });
    yield { type: "run_error", message };
  }
}

async function completeRun(
  agentRunId: string,
  status: "completed" | "failed",
  data: {
    ttftMs: number | null;
    loopStartedAt: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    errorMessage?: string;
  },
) {
  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status,
      completedAt: new Date(),
      ttftMs: data.ttftMs !== null ? Math.round(data.ttftMs) : null,
      totalDurationMs: Math.round(performance.now() - data.loopStartedAt),
      inputTokens: data.totalInputTokens,
      outputTokens: data.totalOutputTokens,
      errorMessage: data.errorMessage,
    },
  });
}

// Re-exported so callers building the tools list for a UI don't need a
// second import path.
export { ALL_TOOLS };
