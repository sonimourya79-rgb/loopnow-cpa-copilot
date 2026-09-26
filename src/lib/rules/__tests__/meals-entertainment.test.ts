import { describe, it, expect } from "vitest";
import { applyMealsLimitation } from "../meals-entertainment";

describe("applyMealsLimitation", () => {
  it("standard rule: $12 GST -> 50% -> $6 eligible (the assessment's own worked example)", () => {
    const result = applyMealsLimitation(12, "standard");
    expect(result.eligibilityPercentage).toBe(50);
    expect(result.eligibleTax).toBe(6);
  });

  it("defaults to 'standard' when no exception type is given", () => {
    const result = applyMealsLimitation(12);
    expect(result.exceptionType).toBe("standard");
    expect(result.eligibilityPercentage).toBe(50);
  });

  it("charity exception: 100% eligible", () => {
    const result = applyMealsLimitation(12, "charity");
    expect(result.eligibilityPercentage).toBe(100);
    expect(result.eligibleTax).toBe(12);
  });

  it("long-haul truck driver exception: 80% eligible", () => {
    const result = applyMealsLimitation(12, "long_haul_truck_driver");
    expect(result.eligibilityPercentage).toBe(80);
    expect(result.eligibleTax).toBe(9.6);
  });

  it("rounds to the nearest cent", () => {
    const result = applyMealsLimitation(10.03, "standard");
    expect(result.eligibleTax).toBe(5.02); // 5.015 rounds to 5.02
  });

  it("zero tax produces zero eligible tax regardless of exception", () => {
    expect(applyMealsLimitation(0, "standard").eligibleTax).toBe(0);
    expect(applyMealsLimitation(0, "charity").eligibleTax).toBe(0);
  });

  it("rejects a negative tax amount", () => {
    expect(() => applyMealsLimitation(-5)).toThrow(RangeError);
  });

  it("names the actual rule applied for each exception type, for audit trail purposes", () => {
    expect(applyMealsLimitation(10, "standard").ruleApplied).toMatch(/67\.1/);
    expect(applyMealsLimitation(10, "charity").ruleApplied).toMatch(/charity/i);
    expect(applyMealsLimitation(10, "long_haul_truck_driver").ruleApplied).toMatch(/truck driver/i);
  });
});
