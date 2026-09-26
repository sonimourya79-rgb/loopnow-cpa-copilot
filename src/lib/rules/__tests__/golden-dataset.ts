/**
 * Golden evaluation dataset for the ITC rules engine.
 *
 * Every `expected` value here was worked out BY HAND against the CRA rules
 * this engine implements (documentation tiers, the 50/80/100% meals rates,
 * commercial-use apportionment) — this is not a snapshot of whatever the
 * code currently outputs. A case failing here means the code disagrees with
 * the intended rule, which is the whole point of a golden dataset: it catches
 * a regression a snapshot test would just silently re-baseline.
 *
 * `falseApproval: true` marks a case where the WRONG behavior would be to
 * grant ITC eligibility — golden-dataset.eval.test.ts computes the
 * false-approval rate specifically over these cases, per the assessment's
 * named metric.
 */
import type { ItcCalculationInput, ItcCalculationResult } from "../itc-calculation";

export interface GoldenCase {
  description: string;
  input: ItcCalculationInput;
  expected: Pick<ItcCalculationResult, "eligibleITC" | "reasonCode" | "documentationTier" | "requiresReview">;
  /** True when the correct outcome is $0 eligible / held for review — a case where a bug would look like an (incorrect) approval. */
  falseApprovalRisk?: boolean;
}

const complete = { documentationStatus: "complete" as const };

export const GOLDEN_DATASET: GoldenCase[] = [
  // ── Documentation tier boundaries ─────────────────────────────────────
  {
    description: "Tier 1 boundary: $29.99 total, complete docs, full commercial use",
    input: { subtotal: 27.24, taxAmount: 2.75, category: "office_expenses", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 2.75, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 1, requiresReview: false },
  },
  {
    description: "Tier 2 boundary: exactly $30.00 total",
    input: { subtotal: 27.27, taxAmount: 2.73, category: "office_expenses", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 2.73, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 2, requiresReview: false },
  },
  {
    description: "Tier 2/3 boundary: exactly $150.00 total",
    input: { subtotal: 136.36, taxAmount: 13.64, category: "office_expenses", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 13.64, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 3, requiresReview: false },
  },
  {
    description: "Tier 3 with incomplete documentation is held for review, not denied outright or approved",
    input: { subtotal: 200, taxAmount: 26, category: "office_expenses", commercialUsePercentage: 100, documentationStatus: "incomplete" },
    expected: { eligibleITC: 0, reasonCode: "ITC_REVIEW_REQUIRED_INCOMPLETE_DOCUMENTATION", documentationTier: 3, requiresReview: true },
    falseApprovalRisk: true,
  },

  // ── Commercial-use percentage ──────────────────────────────────────────
  {
    description: "0% commercial use denies the whole claim regardless of documentation quality",
    input: { subtotal: 100, taxAmount: 13, category: "office_expenses", commercialUsePercentage: 0, ...complete },
    expected: { eligibleITC: 0, reasonCode: "ITC_ZERO_COMMERCIAL_USE", documentationTier: 2, requiresReview: false },
    falseApprovalRisk: true,
  },
  {
    description: "50% commercial use halves the eligible tax exactly",
    input: { subtotal: 100, taxAmount: 13, category: "office_expenses", commercialUsePercentage: 50, ...complete },
    expected: { eligibleITC: 6.5, reasonCode: "ITC_PARTIAL_COMMERCIAL_USE", documentationTier: 2, requiresReview: false },
  },
  {
    description: "100% commercial use is fully eligible",
    input: { subtotal: 100, taxAmount: 13, category: "office_expenses", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 13, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 2, requiresReview: false },
  },
  {
    description: "1% commercial use — the near-zero edge, not rounded away to nothing",
    input: { subtotal: 1000, taxAmount: 130, category: "office_expenses", commercialUsePercentage: 1, ...complete },
    expected: { eligibleITC: 1.3, reasonCode: "ITC_PARTIAL_COMMERCIAL_USE", documentationTier: 3, requiresReview: false },
  },

  // ── Meals & entertainment ───────────────────────────────────────────────
  {
    description: "Standard meals rule: the assessment's own worked example ($12 GST -> 50% -> $6)",
    input: { subtotal: 100, taxAmount: 12, category: "meals_entertainment", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 6, reasonCode: "ITC_MEALS_LIMITATION_APPLIED", documentationTier: 2, requiresReview: false },
  },
  {
    description: "Charity exception: 100% of meals tax eligible",
    input: { subtotal: 100, taxAmount: 12, category: "meals_entertainment", commercialUsePercentage: 100, documentationStatus: "complete", mealsExceptionType: "charity" },
    expected: { eligibleITC: 12, reasonCode: "ITC_MEALS_LIMITATION_APPLIED", documentationTier: 2, requiresReview: false },
  },
  {
    description: "Long-haul truck driver exception: 80% of meals tax eligible",
    input: { subtotal: 100, taxAmount: 12, category: "meals_entertainment", commercialUsePercentage: 100, documentationStatus: "complete", mealsExceptionType: "long_haul_truck_driver" },
    expected: { eligibleITC: 9.6, reasonCode: "ITC_MEALS_LIMITATION_APPLIED", documentationTier: 2, requiresReview: false },
  },
  {
    description: "Meals limitation compounds with a partial commercial-use percentage",
    input: { subtotal: 100, taxAmount: 12, category: "meals_entertainment", commercialUsePercentage: 50, ...complete },
    expected: { eligibleITC: 3, reasonCode: "ITC_MEALS_LIMITATION_APPLIED", documentationTier: 2, requiresReview: false },
  },
  {
    description: "Meals at 0% commercial use is still zero, not the 50% floor",
    input: { subtotal: 100, taxAmount: 12, category: "meals_entertainment", commercialUsePercentage: 0, ...complete },
    expected: { eligibleITC: 0, reasonCode: "ITC_ZERO_COMMERCIAL_USE", documentationTier: 2, requiresReview: false },
    falseApprovalRisk: true,
  },

  // ── Missing / denied documentation ──────────────────────────────────────
  {
    description: "Missing documentation denies outright even at 100% commercial use — no partial credit",
    input: { subtotal: 500, taxAmount: 65, category: "office_expenses", commercialUsePercentage: 100, documentationStatus: "missing" },
    expected: { eligibleITC: 0, reasonCode: "ITC_DENIED_MISSING_DOCUMENTATION", documentationTier: 3, requiresReview: false },
    falseApprovalRisk: true,
  },
  {
    description: "No GST/HST charged at all — nothing to claim, distinct from a denial",
    input: { subtotal: 100, taxAmount: 0, category: "office_expenses", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 0, reasonCode: "ITC_NO_TAX_CHARGED", documentationTier: 2, requiresReview: false },
  },

  // ── Adversarial-shaped but structurally valid inputs ────────────────────
  {
    description: "A commercial-use percentage exactly at the schema's ceiling (100) is accepted, not off-by-one rejected",
    input: { subtotal: 50, taxAmount: 6.5, category: "vehicle", commercialUsePercentage: 100, ...complete },
    // total = 56.50 -> >= the $30 Tier 2 floor, < the $150 Tier 3 floor.
    expected: { eligibleITC: 6.5, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 2, requiresReview: false },
  },
  {
    description: "A very large expense (well into Tier 3) with full documentation is fully eligible, not capped by amount alone",
    input: { subtotal: 50000, taxAmount: 6500, category: "professional_fees", commercialUsePercentage: 100, ...complete },
    expected: { eligibleITC: 6500, reasonCode: "ITC_FULL_ELIGIBLE", documentationTier: 3, requiresReview: false },
  },
];
