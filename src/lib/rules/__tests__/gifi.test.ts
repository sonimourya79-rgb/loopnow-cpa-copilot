import { describe, it, expect } from "vitest";
import { verifyProposedGifiCode, defaultGifiForCategory, GIFI_CATALOGUE } from "../gifi";

describe("verifyProposedGifiCode", () => {
  it("confirms a real code that matches its category", () => {
    const result = verifyProposedGifiCode("8810", "office_expenses");
    expect(result.state).toBe("CONFIRMED");
    expect(result.code).toBe("8810");
    expect(result.label).toBe("Office expenses");
  });

  it("confirms a real code when no category is supplied to check against", () => {
    const result = verifyProposedGifiCode("8810");
    expect(result.state).toBe("CONFIRMED");
  });

  it("REVIEW_REQUIRED for a code that does not exist in the catalogue at all", () => {
    const result = verifyProposedGifiCode("9999");
    expect(result.state).toBe("REVIEW_REQUIRED");
    expect(result.code).toBeNull();
  });

  it("REVIEW_REQUIRED for a hallucinated-looking code with a plausible label — never trusts the proposed label", () => {
    // Simulates an LLM inventing a code/label pair that sounds right but isn't real.
    const result = verifyProposedGifiCode("4242", "office_expenses");
    expect(result.state).toBe("REVIEW_REQUIRED");
    expect(result.label).toBeNull();
  });

  it("REVIEW_REQUIRED when a real code is proposed for the wrong category", () => {
    const result = verifyProposedGifiCode("8523", "office_expenses"); // 8523 is meals & entertainment
    expect(result.state).toBe("REVIEW_REQUIRED");
  });

  it("every catalogue entry is self-consistent (code maps back to itself)", () => {
    for (const entry of GIFI_CATALOGUE) {
      const result = verifyProposedGifiCode(entry.code);
      expect(result.state).toBe("CONFIRMED");
      expect(result.code).toBe(entry.code);
    }
  });
});

describe("defaultGifiForCategory", () => {
  it("returns the confirmed default for a known category", () => {
    const result = defaultGifiForCategory("meals_entertainment");
    expect(result.state).toBe("CONFIRMED");
    expect(result.code).toBe("8523");
  });

  it("REVIEW_REQUIRED for a category with no default mapping, rather than guessing", () => {
    const result = defaultGifiForCategory("some_unmapped_category");
    expect(result.state).toBe("REVIEW_REQUIRED");
    expect(result.code).toBeNull();
  });
});
