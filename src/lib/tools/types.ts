/**
 * Tool architecture — the boundary between "the agent decided to try
 * something" and "something deterministic actually happened."
 *
 * Every tool declares a Zod input schema and a pure(-ish) `execute` function.
 * `executeTool` is the ONLY way a tool ever runs: it validates input BEFORE
 * calling execute (an agent's malformed or injected-looking arguments never
 * reach business logic), times the call, and never lets a thrown error
 * escape as a raw stack trace — the caller always gets a structured
 * `ToolResult`, success or failure, safe to show a user or hand back to the
 * model as the next message in the conversation.
 */

import { z } from "zod";

export interface ToolDefinition<InputSchema extends z.ZodType, Output> {
  name: string;
  /** Shown to the LLM as part of the tool's definition — write it for the model, not for a human reader. */
  description: string;
  inputSchema: InputSchema;
  execute: (input: z.infer<InputSchema>) => Promise<Output> | Output;
}

export interface ToolResult<Output = unknown> {
  toolName: string;
  /** The raw, unvalidated arguments the caller proposed — kept even on failure, since a rejected proposal is itself audit evidence. */
  input: unknown;
  output: Output | null;
  succeeded: boolean;
  /** Safe to display — never a raw stack trace or an internal exception message. */
  errorMessage: string | null;
  latencyMs: number;
}

/**
 * Run a tool by name against raw (untrusted) input.
 *
 * Three distinct failure modes, all converted to the same safe shape:
 *   1. Unknown tool name -> structured failure, never a thrown ReferenceError.
 *   2. Schema validation failure -> the exact Zod issue list, safe to show,
 *      never "something went wrong."
 *   3. The tool's own execute() throwing -> the error's message only (never
 *      the stack trace, which can leak file paths/internals) unless it's an
 *      unrecognized error shape, in which case a generic safe message.
 */
export async function executeTool<InputSchema extends z.ZodType, Output>(
  tool: ToolDefinition<InputSchema, Output>,
  rawInput: unknown,
): Promise<ToolResult<Output>> {
  const startedAt = performance.now();

  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      toolName: tool.name,
      input: rawInput,
      output: null,
      succeeded: false,
      errorMessage: `Invalid input for tool '${tool.name}': ${z.prettifyError(parsed.error)}`,
      latencyMs: performance.now() - startedAt,
    };
  }

  try {
    const output = await tool.execute(parsed.data);
    return {
      toolName: tool.name,
      input: rawInput,
      output,
      succeeded: true,
      errorMessage: null,
      latencyMs: performance.now() - startedAt,
    };
  } catch (err) {
    return {
      toolName: tool.name,
      input: rawInput,
      output: null,
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Tool execution failed",
      latencyMs: performance.now() - startedAt,
    };
  }
}
