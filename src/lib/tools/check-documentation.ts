/**
 * `check_documentation` — the tool wrapping the CRA documentation-tier
 * classification. Pure and deterministic: same inputs, same answer, every
 * time, regardless of anything a receipt's free text claims.
 */
import { z } from "zod";
import { checkDocumentation, RequiredDocumentationFieldSchema } from "@/lib/rules";
import type { ToolDefinition, } from "./types";
import type { DocumentationCheckResult } from "@/lib/rules";

export const CheckDocumentationInputSchema = z.object({
  totalAmount: z.number().nonnegative(),
  presentFields: z.array(RequiredDocumentationFieldSchema),
});

export const checkDocumentationTool: ToolDefinition<typeof CheckDocumentationInputSchema, DocumentationCheckResult> = {
  name: "check_documentation",
  description:
    "Classify a receipt's CRA documentation tier from its total amount, and check which required " +
    "fields (if any) are missing for that tier. This is a fixed rule table, not a judgment call.",
  inputSchema: CheckDocumentationInputSchema,
  execute({ totalAmount, presentFields }) {
    return checkDocumentation(totalAmount, presentFields);
  },
};
