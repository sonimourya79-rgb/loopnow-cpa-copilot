import { z } from "zod";
import type { ToolDefinition } from "./types";
import { readReceiptTool } from "./read-receipt";
import { checkDocumentationTool } from "./check-documentation";
import { calculateItcTool } from "./calculate-itc";
import { classifyGifiTool } from "./classify-gifi";
import { validateGstHstTool } from "./validate-gst-hst";
import { proposeExpenseTool } from "./propose-expense";

export * from "./types";
export { readReceiptTool } from "./read-receipt";
export { checkDocumentationTool } from "./check-documentation";
export { calculateItcTool } from "./calculate-itc";
export { classifyGifiTool } from "./classify-gifi";
export { validateGstHstTool } from "./validate-gst-hst";
export { proposeExpenseTool } from "./propose-expense";

/**
 * Every tool the agent may call, in the order the pipeline described in the
 * assessment actually runs: read → validate docs → validate GST/HST →
 * calculate → classify → propose (the only write).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: ToolDefinition<z.ZodType, any>[] = [
  readReceiptTool,
  checkDocumentationTool,
  validateGstHstTool,
  calculateItcTool,
  classifyGifiTool,
  proposeExpenseTool,
];

export const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]));

/**
 * Tool definitions in the exact shape the Anthropic Messages API expects for
 * `tools:` — derived from each tool's own Zod schema via Zod v4's native
 * `toJSONSchema`, so the schema the model sees and the schema that actually
 * validates its arguments can never drift apart into two hand-maintained copies.
 */
export function toolsForAnthropic() {
  return ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: z.toJSONSchema(tool.inputSchema, { target: "draft-7" }) as Record<string, unknown>,
  }));
}
