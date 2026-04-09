import { Alert, Linking } from "react-native";

/** When set, errors use this instead of `Alert.alert` (better on web). */
export type WhatsAppFeedback = {
  error: (message: string) => void;
};

/**
 * Normalize a stored phone for `https://wa.me/{number}`:
 * - Trim and Unicode-normalize (NFKC)
 * - Remove `+`, spaces, dashes, parentheses, dots — **digits only** (no `+` prefix)
 */
export function normalizePhoneForWaMe(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).normalize("NFKC").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits;
}

/** Digits-only country calling code from user input (e.g. "+92" → "92"). */
export function digitsOnlyCountryPrefix(prefixRaw: string | null | undefined): string {
  return String(prefixRaw ?? "").replace(/\D/g, "");
}

/**
 * When a default country code is set: if `raw` digits do not already start with that code,
 * prepend it (after stripping a leading national `0`). Otherwise same as {@link normalizePhoneForWaMe}.
 */
export function normalizePhoneForWaMeWithPrefix(
  raw: string | null | undefined,
  countryPrefixRaw: string | null | undefined,
): string | null {
  const s = String(raw ?? "").normalize("NFKC").trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const prefix = digitsOnlyCountryPrefix(countryPrefixRaw);
  if (!prefix) return digits;
  if (digits.startsWith(prefix) && digits.length >= prefix.length + 6) return digits;
  const national = digits.replace(/^0+/, "") || digits;
  const combined = prefix + national;
  if (combined.length < 8) return null;
  return combined;
}

/** Alias — same rules as {@link normalizePhoneForWaMe}. */
export const digitsOnlyPhone = normalizePhoneForWaMe;

export function buildWhatsAppUrl(digits: string): string {
  return `https://wa.me/${digits}`;
}

export function buildWhatsAppUrlWithText(digits: string, message: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

async function openWaUrl(url: string, feedback?: WhatsAppFeedback): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Install WhatsApp or check your connection.";
    if (feedback) {
      feedback.error(detail ? `Could not open WhatsApp — ${detail}` : "Could not open WhatsApp.");
    } else {
      Alert.alert("Could not open WhatsApp", detail);
    }
  }
}

/**
 * Opens `https://wa.me/{digits}` via {@link Linking.openURL}.
 * Missing or too-short number (after stripping) → alert **"No phone number"**.
 */
export async function openWhatsAppForPhone(
  rawPhone: string | null | undefined,
  opts?: { countryPrefix?: string | null; feedback?: WhatsAppFeedback },
): Promise<void> {
  const digits = opts?.countryPrefix
    ? normalizePhoneForWaMeWithPrefix(rawPhone, opts.countryPrefix)
    : normalizePhoneForWaMe(rawPhone);
  if (!digits) {
    const msg = "No phone number on file.";
    if (opts?.feedback) opts.feedback.error(msg);
    else Alert.alert(msg);
    return;
  }
  await openWaUrl(buildWhatsAppUrl(digits), opts?.feedback);
}

/**
 * Same normalization; opens `https://wa.me/{digits}?text=...` for draft replies.
 */
export async function openWhatsAppWithPrefilledText(
  rawPhone: string | null | undefined,
  message: string,
  opts?: { countryPrefix?: string | null; feedback?: WhatsAppFeedback },
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) return;
  const digits = opts?.countryPrefix
    ? normalizePhoneForWaMeWithPrefix(rawPhone, opts.countryPrefix)
    : normalizePhoneForWaMe(rawPhone);
  if (!digits) {
    const msg = "No phone number on file.";
    if (opts?.feedback) opts.feedback.error(msg);
    else Alert.alert(msg);
    return;
  }
  await openWaUrl(buildWhatsAppUrlWithText(digits, trimmed), opts?.feedback);
}
