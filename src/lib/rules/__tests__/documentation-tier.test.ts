import { describe, it, expect } from "vitest";
import { getDocumentationTier, checkDocumentation, requiredFieldsForTier } from "../documentation-tier";

describe("getDocumentationTier — boundary cases", () => {
  it("29.99 is Tier 1 (just under the Tier 2 floor)", () => {
    expect(getDocumentationTier(29.99)).toBe(1);
  });
  it("30.00 is Tier 2 (exactly the floor, inclusive)", () => {
    expect(getDocumentationTier(30.0)).toBe(2);
  });
  it("30.01 is Tier 2 (just over the floor)", () => {
    expect(getDocumentationTier(30.01)).toBe(2);
  });
  it("149.99 is Tier 2 (just under the Tier 3 floor)", () => {
    expect(getDocumentationTier(149.99)).toBe(2);
  });
  it("150.00 is Tier 3 (exactly the floor, inclusive)", () => {
    expect(getDocumentationTier(150.0)).toBe(3);
  });
  it("150.01 is Tier 3 (just over the floor)", () => {
    expect(getDocumentationTier(150.01)).toBe(3);
  });
  it("0 is Tier 1", () => {
    expect(getDocumentationTier(0)).toBe(1);
  });
  it("rejects negative amounts", () => {
    expect(() => getDocumentationTier(-1)).toThrow(RangeError);
  });
  it("rejects non-finite amounts", () => {
    expect(() => getDocumentationTier(Number.NaN)).toThrow(RangeError);
    expect(() => getDocumentationTier(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("requiredFieldsForTier", () => {
  it("Tier 1 requires only supplier name", () => {
    expect(requiredFieldsForTier(1)).toEqual(["supplier_name"]);
  });
  it("Tier 2 is a strict superset of Tier 1", () => {
    const t1 = requiredFieldsForTier(1);
    const t2 = requiredFieldsForTier(2);
    for (const f of t1) expect(t2).toContain(f);
    expect(t2.length).toBeGreaterThan(t1.length);
  });
  it("Tier 3 is a strict superset of Tier 2", () => {
    const t2 = requiredFieldsForTier(2);
    const t3 = requiredFieldsForTier(3);
    for (const f of t2) expect(t3).toContain(f);
    expect(t3.length).toBeGreaterThan(t2.length);
  });
});

describe("checkDocumentation", () => {
  it("flags nothing missing when every required field for the tier is present", () => {
    const result = checkDocumentation(20, ["supplier_name"]);
    expect(result.tier).toBe(1);
    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("flags exactly the missing fields at Tier 2", () => {
    const result = checkDocumentation(75, ["supplier_name", "date"]);
    expect(result.tier).toBe(2);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(["gst_hst_number", "total_amount"]);
  });

  it("Tier 3 with only Tier 2 fields is incomplete", () => {
    const result = checkDocumentation(200, ["supplier_name", "gst_hst_number", "date", "total_amount"]);
    expect(result.tier).toBe(3);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toEqual(["itemized_description", "purchaser_name", "terms_of_payment"]);
  });

  it("accepts a Set as well as an array", () => {
    const result = checkDocumentation(10, new Set(["supplier_name"]));
    expect(result.isComplete).toBe(true);
  });
});
