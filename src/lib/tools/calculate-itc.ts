/**
 * `calculate_itc` — the single most important tool in this system.
 *
 * This is the ONLY path by which an ITC dollar amount is ever produced. The
 * agent may call it, may explain its result in plain language, may even
 * argue with the user about what inputs are correct — but it can never
 * compute the number itself, and this tool's Zod schema is the wall that
 * makes "the agent slipped a different number past this" structurally
 * impossible: any input that doesn't match the schema is rejected before
 * `calculateITC` ever runs.
 */
import {
  calculateITC,
  ItcCalculationInputSchema,
  type ItcCalculationResult,
} from "@/lib/rules";
import type { ToolDefinition } from "./types";

export const calculateItcTool: ToolDefinition<typeof ItcCalculationInputSchema, ItcCalculationResult> = {
  name: "calculate_itc",
  description:
    "Calculate the Input Tax Credit (ITC) eligible for a single expense line, applying the meals & " +
    "entertainment limitation and commercial-use percentage deterministically. This is the ONLY " +
    "source of truth for the ITC dollar amount — never state or imply a different number.",
  inputSchema: ItcCalculationInputSchema,
  execute(input) {
    return calculateITC(input);
  },
};

// Re-exported for callers that want the bare schema without the tool wrapper
// (e.g. the UI form that collects these same fields from a human reviewer).
export { ItcCalculationInputSchema };
export type { ItcCalculationResult };
