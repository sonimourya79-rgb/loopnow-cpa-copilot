/**
 * Input Tax Credit (ITC) calculation engine.
 *
 * This is the one place dollar-and-cents ITC eligibility is decided. The
 * agent may gather inputs and may DISPLAY this function's output, but it
 * never performs this arithmetic itself and never overrides the result —
 * that is the single most heavily penalized mistake this system can make.
 *
 * Invariant enforced on every call: `eligibleITC <= taxAmount`. Percentages
 * only ever compound downward (meals limitation, then commercial-use %), so
 * this holds by construction — the runtime assertion at the end exists to
 * catch a future edit that breaks that assumption, not because the current
 * logic can violate it.
 */

import { z } from "zod";
import { getDocumentationTier, type DocumentationTier } from "./documentation-tier";
import { applyMealsLimitation, MEALS_EXCEPTION_TYPES, type MealsExceptionType } from "./meals-entertainment";

export const EXPENSE_CATEGORIES = [
  "meals_entertainment",
  "office_expenses",
  "travel",
  "vehicle",
  "supplies",
  "professional_fees",
  "repairs_maintenance",
  "insurance",
  "utilities",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const DOCUMENTATION_STATUSES = ["complete", "incomplete", "missing"] as const;
export type DocumentationStatus = (typeof DOCUMENTATION_STATUSES)[number];

export const ItcCalculationInputSchema = z.object({
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  category: z.enum(EXPENSE_CATEGORIES),
  commercialUsePercentage: z.number().min(0).max(100),
  documentationStatus: z.enum(DOCUMENTATION_STATUSES),
  /** Only consulted when category === "meals_entertainment"; defaults to "standard". */
  mealsExceptionType: z.enum(MEALS_EXCEPTION_TYPES).optional(),
});
export type ItcCalculationInput = z.infer<typeof ItcCalculationInputSchema>;

export type ItcReasonCode =
  | "ITC_NO_TAX_CHARGED"
  | "ITC_DENIED_MISSING_DOCUMENTATION"
  | "ITC_REVIEW_REQUIRED_INCOMPLETE_DOCUMENTATION"
  | "ITC_ZERO_COMMERCIAL_USE"
  | "ITC_FULL_ELIGIBLE"
  | "ITC_PARTIAL_COMMERCIAL_USE"
  | "ITC_MEALS_LIMITATION_APPLIED";

export interface ItcCalculationResult {
  /** Final % of the ORIGINAL taxAmount that is ITC-eligible, 0–100. Derived from eligibleITC, not the other way around. */
  eligibilityPercentage: number;
  /** Dollar amount. Always <= input.taxAmount. */
  eligibleITC: number;
  ruleApplied: string;
  reasonCode: ItcReasonCode;
  documentationTier: DocumentationTier;
  /** True when this result is not final — a human must decide before it posts anywhere. */
  requiresReview: boolean;
}

/** See the identical helper in meals-entertainment.ts for why toPrecision(12) is needed here. */
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

export function calculateITC(rawInput: ItcCalculationInput): ItcCalculationResult {
  // Parse, don't trust — throws on anything malformed rather than coercing
  // a bad value into something that looks plausible.
  const input = ItcCalculationInputSchema.parse(rawInput);
  const totalAmount = round2(input.subtotal + input.taxAmount);
  const documentationTier = getDocumentationTier(totalAmount);

  const deny = (reasonCode: ItcReasonCode, ruleApplied: string, requiresReview: boolean): ItcCalculationResult => ({
    eligibilityPercentage: 0,
    eligibleITC: 0,
    ruleApplied,
    reasonCode,
    documentationTier,
    requiresReview,
  });

  if (input.taxAmount === 0) {
    return deny("ITC_NO_TAX_CHARGED", "No GST/HST was charged on this expense — nothing to claim", false);
  }

  // Missing documentation denies the claim outright, no partial credit —
  // there is nothing on file a reviewer could even partially credit.
  if (input.documentationStatus === "missing") {
    return deny(
      "ITC_DENIED_MISSING_DOCUMENTATION",
      "No supporting documentation on file — ITC cannot be claimed",
      false,
    );
  }

  // Incomplete documentation needs a human decision, not a guess in either
  // direction. This applies at every tier — even Tier 1's low bar (supplier
  // name only) being unmet is unusual enough to deserve a look, not a
  // silent pass.
  if (input.documentationStatus === "incomplete") {
    return deny(
      "ITC_REVIEW_REQUIRED_INCOMPLETE_DOCUMENTATION",
      `Tier ${documentationTier} documentation is incomplete — held for manual review`,
      true,
    );
  }

  // documentationStatus === "complete" from here on.

  if (input.commercialUsePercentage === 0) {
    return deny(
      "ITC_ZERO_COMMERCIAL_USE",
      "0% commercial use — expense is entirely personal or exempt use",
      false,
    );
  }

  if (input.category === "meals_entertainment") {
    const meals = applyMealsLimitation(input.taxAmount, input.mealsExceptionType ?? "standard");
    const eligibleITC = round2(meals.eligibleTax * (input.commercialUsePercentage / 100));
    const eligibilityPercentage = round2((eligibleITC / input.taxAmount) * 100);

    assertInvariant(eligibleITC, input.taxAmount);
    return {
      eligibilityPercentage,
      eligibleITC,
      ruleApplied: `${meals.ruleApplied}; then ${input.commercialUsePercentage}% commercial use applied`,
      reasonCode: "ITC_MEALS_LIMITATION_APPLIED",
      documentationTier,
      requiresReview: false,
    };
  }

  const eligibleITC = round2(input.taxAmount * (input.commercialUsePercentage / 100));
  const eligibilityPercentage = input.commercialUsePercentage;
  assertInvariant(eligibleITC, input.taxAmount);

  if (input.commercialUsePercentage === 100) {
    return {
      eligibilityPercentage,
      eligibleITC,
      ruleApplied: "100% commercial use, complete documentation — fully eligible",
      reasonCode: "ITC_FULL_ELIGIBLE",
      documentationTier,
      requiresReview: false,
    };
  }

  return {
    eligibilityPercentage,
    eligibleITC,
    ruleApplied: `${input.commercialUsePercentage}% commercial use applied to GST/HST paid`,
    reasonCode: "ITC_PARTIAL_COMMERCIAL_USE",
    documentationTier,
    requiresReview: false,
  };
}

/** Defensive runtime check — see the file-level invariant note. */
function assertInvariant(eligibleITC: number, taxAmount: number): void {
  if (eligibleITC > taxAmount + 1e-9) {
    throw new Error(
      `ITC invariant violated: eligibleITC (${eligibleITC}) exceeds taxAmount (${taxAmount}). This is a bug in calculateITC, not a valid business outcome.`,
    );
  }
}
