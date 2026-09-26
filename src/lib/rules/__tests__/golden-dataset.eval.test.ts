import { describe, it, expect } from "vitest";
import { calculateITC } from "../itc-calculation";
import { GOLDEN_DATASET } from "./golden-dataset";

describe("Golden dataset — every hand-verified case", () => {
  it.each(GOLDEN_DATASET)("$description", ({ input, expected }) => {
    const result = calculateITC(input);
    expect(result.eligibleITC).toBe(expected.eligibleITC);
    expect(result.reasonCode).toBe(expected.reasonCode);
    expect(result.documentationTier).toBe(expected.documentationTier);
    expect(result.requiresReview).toBe(expected.requiresReview);
  });
});

describe("Golden dataset — aggregate evaluation metrics", () => {
  it("reports classification accuracy and false-approval rate across the dataset", () => {
    let exactMatches = 0;
    let falseApprovals = 0;
    const falseApprovalRiskCases = GOLDEN_DATASET.filter((c) => c.falseApprovalRisk);

    for (const goldenCase of GOLDEN_DATASET) {
      const result = calculateITC(goldenCase.input);
      const isExactMatch =
        result.eligibleITC === goldenCase.expected.eligibleITC &&
        result.reasonCode === goldenCase.expected.reasonCode &&
        result.documentationTier === goldenCase.expected.documentationTier &&
        result.requiresReview === goldenCase.expected.requiresReview;
      if (isExactMatch) exactMatches++;

      // A false approval: a case whose CORRECT answer is $0/held-for-review,
      // but the engine actually granted a positive, unreviewed ITC amount.
      if (goldenCase.falseApprovalRisk) {
        const wronglyApproved = result.eligibleITC > 0 && !result.requiresReview;
        if (wronglyApproved) falseApprovals++;
      }
    }

    const accuracy = exactMatches / GOLDEN_DATASET.length;
    const falseApprovalRate = falseApprovalRiskCases.length > 0 ? falseApprovals / falseApprovalRiskCases.length : 0;

    console.log(
      `[golden-dataset] ${GOLDEN_DATASET.length} cases | ` +
      `classification accuracy: ${(accuracy * 100).toFixed(1)}% | ` +
      `false-approval rate (n=${falseApprovalRiskCases.length}): ${(falseApprovalRate * 100).toFixed(1)}%`,
    );

    // The bar this suite actually enforces, not just reports: 100% exact
    // match and ZERO false approvals. A rules engine for tax credits has no
    // acceptable rate of "approved something it should have denied."
    expect(accuracy).toBe(1);
    expect(falseApprovalRate).toBe(0);
  });
});
