/**
 * CRA documentation tiers for input tax credit (ITC) support.
 *
 * Per CRA's informal-supplier-documentation guidance (GST/HST Memorandum 8.4),
 * the amount of proof required to support an ITC claim scales with the total
 * amount paid (price + GST/HST), not with the tax amount alone:
 *
 *   Tier 1  < $30            minimal: supplier's name is enough
 *   Tier 2  $30.00–$149.99   "prescribed information": supplier name,
 *                            registration number, date, total amount
 *   Tier 3  >= $150.00       full invoice: everything in Tier 2 plus an
 *                            itemized description, the purchaser's name, and
 *                            terms of payment
 *
 * This is a pure, deterministic classification — it never calls the LLM and
 * never changes behind a feature flag hidden in a prompt. An agent may only
 * ask "what tier is this receipt," never decide the tier itself.
 */

import { z } from "zod";

export const DOCUMENTATION_TIERS = [1, 2, 3] as const;
export type DocumentationTier = (typeof DOCUMENTATION_TIERS)[number];

export const TIER_2_FLOOR = 30;
export const TIER_3_FLOOR = 150;

export const RequiredDocumentationFieldSchema = z.enum([
  "supplier_name",
  "gst_hst_number",
  "date",
  "total_amount",
  "itemized_description",
  "purchaser_name",
  "terms_of_payment",
]);
export type RequiredDocumentationField = z.infer<typeof RequiredDocumentationFieldSchema>;

/** Fields required at each tier — strictly additive, Tier 3 requires everything Tier 2 does. */
const TIER_REQUIREMENTS: Record<DocumentationTier, RequiredDocumentationField[]> = {
  1: ["supplier_name"],
  2: ["supplier_name", "gst_hst_number", "date", "total_amount"],
  3: [
    "supplier_name",
    "gst_hst_number",
    "date",
    "total_amount",
    "itemized_description",
    "purchaser_name",
    "terms_of_payment",
  ],
};

/**
 * Classify a receipt's total amount into its CRA documentation tier.
 *
 * The boundary is on the TOTAL amount paid (subtotal + tax), inclusive at the
 * floor of each tier: exactly $30.00 is Tier 2, exactly $150.00 is Tier 3.
 */
export function getDocumentationTier(totalAmount: number): DocumentationTier {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new RangeError(`getDocumentationTier: totalAmount must be a finite, non-negative number, got ${totalAmount}`);
  }
  if (totalAmount >= TIER_3_FLOOR) return 3;
  if (totalAmount >= TIER_2_FLOOR) return 2;
  return 1;
}

/** The fields CRA requires on file to support an ITC claim at this tier. */
export function requiredFieldsForTier(tier: DocumentationTier): readonly RequiredDocumentationField[] {
  return TIER_REQUIREMENTS[tier];
}

export interface DocumentationCheckResult {
  tier: DocumentationTier;
  requiredFields: readonly RequiredDocumentationField[];
  missingFields: RequiredDocumentationField[];
  /** True only when every required field for this tier is present. */
  isComplete: boolean;
}

/**
 * Check a receipt's captured fields against what its tier requires.
 *
 * `presentFields` is the set of fields the receipt/OCR/agent has actually
 * captured — never inferred from receipt free text without a corresponding
 * structured field, since that is exactly the kind of claim this system is
 * built to refuse to trust blindly.
 */
export function checkDocumentation(
  totalAmount: number,
  presentFields: ReadonlySet<RequiredDocumentationField> | RequiredDocumentationField[],
): DocumentationCheckResult {
  const tier = getDocumentationTier(totalAmount);
  const present = presentFields instanceof Set ? presentFields : new Set(presentFields);
  const required = requiredFieldsForTier(tier);
  const missingFields = required.filter((f) => !present.has(f));

  return {
    tier,
    requiredFields: required,
    missingFields,
    isComplete: missingFields.length === 0,
  };
}
