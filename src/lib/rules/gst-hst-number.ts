/**
 * GST/HST registration number handling.
 *
 * Format: 9 digits (the Business Number) + "RT" (the GST/HST program
 * identifier) + a 4-digit reference number, e.g. `123456789RT0001`.
 *
 * Deliberately two separate, non-conflatable checks:
 *   - FORMAT validity: does the string have the right shape? Pure regex, free,
 *     instant, no external call.
 *   - REGISTRATION validity: is this actually a real, currently-registered
 *     number? Only the CRA GST/HST Registry lookup can answer that, and this
 *     module makes NO claim about it — a format-valid number can still belong
 *     to nobody, or to a deregistered business. Never let a caller (or an
 *     LLM) treat "format valid" as "CRA has accepted this."
 */

const GST_HST_FORMAT = /^\d{9}RT\d{4}$/;

export type GstHstFormatCheck =
  | { valid: true; businessNumber: string; programReference: string }
  | { valid: false; reason: string };

/** Pure format check. Never asserts the number is registered or active. */
export function validateGstHstFormat(raw: string): GstHstFormatCheck {
  const value = raw.trim().toUpperCase();

  if (value.length === 0) {
    return { valid: false, reason: "GST/HST number is empty" };
  }
  if (!GST_HST_FORMAT.test(value)) {
    return {
      valid: false,
      reason:
        "GST/HST number must match 9 digits + 'RT' + 4 digits (e.g. 123456789RT0001)",
    };
  }

  return {
    valid: true,
    businessNumber: value.slice(0, 9),
    programReference: value.slice(9),
  };
}

/**
 * Registration-verification status. This module deliberately does not
 * implement the CRA registry lookup itself (a network-calling, provider-
 * specific concern that belongs in a tool, not a pure rule) — it defines the
 * contract a registry-lookup tool must fulfil, and the caller must never
 * upgrade "unverified" to "verified" on its own reasoning (an LLM's included).
 */
export type GstHstRegistrationStatus = "verified_active" | "verified_inactive" | "unverified" | "lookup_failed";

export interface GstHstCheckResult {
  format: GstHstFormatCheck;
  /** Defaults to "unverified" when no registry lookup was performed. */
  registrationStatus: GstHstRegistrationStatus;
}

/**
 * Combine a format check with a (caller-supplied) registration status.
 *
 * `registrationStatus` must come from an actual CRA registry lookup tool
 * call, never fabricated. Omitting it defaults to "unverified" — the honest
 * default — rather than assuming the best case.
 */
export function checkGstHstNumber(
  raw: string,
  registrationStatus: GstHstRegistrationStatus = "unverified",
): GstHstCheckResult {
  return {
    format: validateGstHstFormat(raw),
    registrationStatus,
  };
}
