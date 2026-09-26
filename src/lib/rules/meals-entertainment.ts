/**
 * Meals & entertainment ITC limitation (ITA s.67.1 / GST/HST Memorandum 8.2).
 *
 * The general rule restricts ITC eligibility on meals & entertainment to 50%
 * of the tax paid, on the theory that half of the expense is personal
 * enjoyment. Two carved-out exceptions apply in full or at a different rate:
 *
 *   - A registered charity or public institution: 100% (the 50% rule exists
 *     to price out a personal-consumption element that doesn't apply to an
 *     organization with no owners to personally benefit).
 *   - A long-haul truck driver's meals during an eligible travel period:
 *     80% (a specific statutory carve-out recognizing the meal is a genuine
 *     cost of doing the job, not entertainment).
 *
 * This table is the single source of truth for the percentage — an agent may
 * ask "what does this exception apply to" but the number itself is never
 * something a prompt states or an LLM computes.
 */

export const MEALS_EXCEPTION_TYPES = ["standard", "charity", "long_haul_truck_driver"] as const;
export type MealsExceptionType = (typeof MEALS_EXCEPTION_TYPES)[number];

/** Percentage of meals & entertainment tax that is ITC-eligible, by exception type. */
export const MEALS_ITC_PERCENTAGE: Record<MealsExceptionType, number> = {
  standard: 50,
  charity: 100,
  long_haul_truck_driver: 80,
};

export interface MealsLimitationResult {
  exceptionType: MealsExceptionType;
  /** 50, 80, or 100 — never a value not present in MEALS_ITC_PERCENTAGE. */
  eligibilityPercentage: number;
  /** taxAmount * eligibilityPercentage / 100, rounded to cents. */
  eligibleTax: number;
  ruleApplied: string;
}

/**
 * Round to the nearest cent, correcting for IEEE-754 representation error
 * introduced by the *100 scaling step — e.g. `5.015 * 100` is stored as
 * `501.49999999999994`, not `501.5`, so a plain `Math.round(n * 100) / 100`
 * rounds $5.015 down to $5.01 instead of the mathematically correct $5.02.
 * `toPrecision(12)` cleans up that representation noise (12 significant
 * digits is far beyond anything a currency calculation needs) right where it
 * actually appears — after scaling, before rounding.
 */
const round2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

/**
 * Apply the meals & entertainment limitation to a tax amount.
 *
 * `taxAmount` must already be the GST/HST portion only (not the subtotal) —
 * this function has no way to tell the two apart and will silently apply the
 * percentage to whatever number it's given, so the caller (the ITC engine)
 * owns getting that right.
 */
export function applyMealsLimitation(
  taxAmount: number,
  exceptionType: MealsExceptionType = "standard",
): MealsLimitationResult {
  if (!Number.isFinite(taxAmount) || taxAmount < 0) {
    throw new RangeError(`applyMealsLimitation: taxAmount must be a finite, non-negative number, got ${taxAmount}`);
  }

  const eligibilityPercentage = MEALS_ITC_PERCENTAGE[exceptionType];
  const eligibleTax = round2(taxAmount * (eligibilityPercentage / 100));

  const ruleApplied =
    exceptionType === "standard"
      ? "ITA s.67.1 — 50% meals & entertainment limitation"
      : exceptionType === "charity"
        ? "GST/HST Memorandum 8.2 — registered charity/public institution exception, 100% eligible"
        : "GST/HST Memorandum 8.2 — long-haul truck driver exception, 80% eligible";

  return { exceptionType, eligibilityPercentage, eligibleTax, ruleApplied };
}
