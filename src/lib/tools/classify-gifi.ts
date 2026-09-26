/**
 * `classify_gifi` — the agent PROPOSES a GIFI code, this tool VERIFIES it.
 *
 * A code the agent invents is treated identically to a genuinely ambiguous
 * classification: both come back REVIEW_REQUIRED. This tool has no way to
 * distinguish a hallucination from a real edge case, and it doesn't try to —
 * it only ever confirms a match against the controlled catalogue.
 */
import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/lib/rules";
import { verifyProposedGifiCode, type GifiClassificationResult } from "@/lib/rules";
import type { ToolDefinition } from "./types";

export const ClassifyGifiInputSchema = z.object({
  proposedCode: z.string().min(1),
  expenseCategory: z.enum(EXPENSE_CATEGORIES).optional(),
});

export const classifyGifiTool: ToolDefinition<typeof ClassifyGifiInputSchema, GifiClassificationResult> = {
  name: "classify_gifi",
  description:
    "Verify a proposed GIFI code against the controlled catalogue. An unrecognized code, or one that " +
    "doesn't match the given expense category, comes back REVIEW_REQUIRED rather than being accepted.",
  inputSchema: ClassifyGifiInputSchema,
  execute({ proposedCode, expenseCategory }) {
    return verifyProposedGifiCode(proposedCode, expenseCategory);
  },
};
