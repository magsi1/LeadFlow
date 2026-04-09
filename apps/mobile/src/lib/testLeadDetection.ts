/** Lowercase tokens treated as placeholder / test names (exact match after trim). */
const TEST_NAME_WORDS = new Set(["my", "test", "xyz", "aaa", "123", "abc"]);

/**
 * Heuristic: very short names or common test tokens (e.g. "my", "xyz").
 * Used for pipeline closed-column styling and similar warnings.
 */
export function isTestLikeLeadName(name: string | null | undefined): boolean {
  const t = typeof name === "string" ? name.trim() : "";
  if (t.length < 2) return true;
  return TEST_NAME_WORDS.has(t.toLowerCase());
}

/** Exact-match tokens (after trim, lowercased) for Settings “Suspicious leads”. */
const SUSPICIOUS_EXACT_TOKENS = new Set(["xyz", "my", "test", "aaa", "123", "abc"]);
const PHONE_ONLY_NAME_RE = /^\+?[\d\s\-()]+$/;
const NON_ALPHA_ONLY_RE = /^[^A-Za-z]+$/;

/**
 * Settings data management: name shorter than 3 characters, or exact placeholder token match.
 */
export function isSuspiciousLeadName(name: string | null | undefined): boolean {
  const t = typeof name === "string" ? name.trim() : "";
  if (t.length < 3) return true;
  if (PHONE_ONLY_NAME_RE.test(t)) return true;
  if (/^\d+$/u.test(t)) return true;
  if (NON_ALPHA_ONLY_RE.test(t)) return true;
  return SUSPICIOUS_EXACT_TOKENS.has(t.toLowerCase());
}

/** @deprecated Use {@link isSuspiciousLeadName}. */
export function isInvalidLeadName(name: string | null | undefined): boolean {
  return isSuspiciousLeadName(name);
}
