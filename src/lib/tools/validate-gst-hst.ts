/**
 * `validate_gst_hst_number` — format check ONLY.
 *
 * This tool deliberately makes no claim about whether the number is actually
 * registered with the CRA — a live registry lookup is a separate, external,
 * network-calling concern (and the CRA's GST/HST Registry has no public
 * unauthenticated API suitable for this project; see README "Known
 * limitations"). Format validity and registration validity are two
 * different questions, and this tool answers exactly one of them —
 * `registrationStatus` always comes back "unverified" here, never upgraded
 * to "verified_active" by inference.
 */
import { z } from "zod";
import { checkGstHstNumber, type GstHstCheckResult } from "@/lib/rules";
import type { ToolDefinition } from "./types";

export const ValidateGstHstInputSchema = z.object({
  gstHstNumber: z.string().min(1),
});

export const validateGstHstTool: ToolDefinition<typeof ValidateGstHstInputSchema, GstHstCheckResult> = {
  name: "validate_gst_hst_number",
  description:
    "Check whether a GST/HST number has the correct FORMAT (9 digits + RT + 4 digits). Does NOT verify " +
    "the number is actually registered with the CRA — registrationStatus is always 'unverified' from " +
    "this tool. Never state or imply that a format-valid number is CRA-confirmed.",
  inputSchema: ValidateGstHstInputSchema,
  execute({ gstHstNumber }) {
    return checkGstHstNumber(gstHstNumber);
  },
};
