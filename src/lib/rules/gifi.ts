/**
 * GIFI (General Index of Financial Information) code classification.
 *
 * The agent may PROPOSE a GIFI code for an expense, but this module is the
 * only thing that decides whether that code is real. A code the agent
 * invents that doesn't exist in the controlled catalogue below is never
 * silently accepted — it comes back REVIEW_REQUIRED, the same outcome as a
 * genuinely ambiguous classification. An LLM hallucinating a plausible-looking
 * code is indistinguishable, from the outside, from a genuine edge case; this
 * module treats both identically rather than trying to guess which one it is.
 *
 * The catalogue here is a representative subset of the real CRA GIFI code
 * list (T2 Corporation Income Tax Return schedule) — enough to route common
 * business expense categories correctly. Extending it is a data change, not a
 * code change: add a row, nothing else moves.
 */

export interface GifiCode {
  code: string;
  label: string;
  /** Expense categories this code is the default/expected mapping for. */
  categories: string[];
}

export const GIFI_CATALOGUE: readonly GifiCode[] = Object.freeze([
  { code: "1001", label: "Cash", categories: [] },
  { code: "8523", label: "Meals and entertainment", categories: ["meals_entertainment"] },
  { code: "8710", label: "Office supplies", categories: ["supplies"] },
  { code: "8810", label: "Office expenses", categories: ["office_expenses"] },
  { code: "9200", label: "Travel expenses", categories: ["travel"] },
  { code: "9281", label: "Motor vehicle expenses", categories: ["vehicle"] },
  { code: "8860", label: "Professional fees", categories: ["professional_fees"] },
  { code: "8960", label: "Repairs and maintenance", categories: ["repairs_maintenance"] },
  { code: "8690", label: "Insurance", categories: ["insurance"] },
  { code: "9270", label: "Utilities", categories: ["utilities"] },
]);

const CATALOGUE_BY_CODE = new Map(GIFI_CATALOGUE.map((entry) => [entry.code, entry]));
const CATALOGUE_BY_CATEGORY = new Map<string, GifiCode>();
for (const entry of GIFI_CATALOGUE) {
  for (const category of entry.categories) {
    CATALOGUE_BY_CATEGORY.set(category, entry);
  }
}

export type GifiClassificationState = "CONFIRMED" | "REVIEW_REQUIRED";

export interface GifiClassificationResult {
  state: GifiClassificationState;
  /** The code that was actually confirmed. Null when REVIEW_REQUIRED. */
  code: string | null;
  label: string | null;
  reason: string;
}

/**
 * Verify a GIFI code the agent proposed against the controlled catalogue.
 *
 * This is the ONLY entry point an agent's proposal should go through — it
 * never trusts the proposed code on its own, and it never trusts the
 * proposed code's label either (only the catalogue's own label is ever
 * returned), so a plausible-sounding hallucinated pair can't slip through
 * because the label happened to match something real.
 */
export function verifyProposedGifiCode(proposedCode: string, expenseCategory?: string): GifiClassificationResult {
  const entry = CATALOGUE_BY_CODE.get(proposedCode.trim());

  if (!entry) {
    return {
      state: "REVIEW_REQUIRED",
      code: null,
      label: null,
      reason: `Proposed GIFI code '${proposedCode}' does not exist in the controlled catalogue`,
    };
  }

  if (expenseCategory && entry.categories.length > 0 && !entry.categories.includes(expenseCategory)) {
    return {
      state: "REVIEW_REQUIRED",
      code: null,
      label: null,
      reason: `GIFI code '${proposedCode}' (${entry.label}) is not a recognized mapping for category '${expenseCategory}'`,
    };
  }

  return { state: "CONFIRMED", code: entry.code, label: entry.label, reason: "Matched controlled catalogue" };
}

/**
 * Look up the DEFAULT GIFI code for a known expense category, when the agent
 * has not (or should not) propose one itself — the deterministic path.
 * Returns REVIEW_REQUIRED for any category with no default mapping, rather
 * than guessing the closest-sounding code.
 */
export function defaultGifiForCategory(expenseCategory: string): GifiClassificationResult {
  const entry = CATALOGUE_BY_CATEGORY.get(expenseCategory);
  if (!entry) {
    return {
      state: "REVIEW_REQUIRED",
      code: null,
      label: null,
      reason: `No default GIFI mapping exists for category '${expenseCategory}'`,
    };
  }
  return { state: "CONFIRMED", code: entry.code, label: entry.label, reason: "Matched controlled catalogue" };
}
