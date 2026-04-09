/**
 * Initials for pipeline avatars: first + last initial, or first two letters for a single name.
 */
export function leadInitialsFromName(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "?";

  const parts = s.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const last = parts[parts.length - 1]?.[0];
    const pair = `${first ?? ""}${last ?? ""}`.toUpperCase();
    return pair.length > 0 ? pair : "?";
  }

  const token = parts[0] ?? s;
  if (token.length >= 2) return token.slice(0, 2).toUpperCase();
  return `${token[0] ?? "?"}${token[0] ?? "?"}`.toUpperCase();
}

/** Brand-tinted palette (readable with white initials on dark UI). */
const AVATAR_PALETTE = [
  "#0ea5e9",
  "#8b5cf6",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
] as const;

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable background color from name (same name → same color). */
export function avatarBackgroundFromName(raw: string | null | undefined): string {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!key) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[hashString(key) % AVATAR_PALETTE.length];
}
