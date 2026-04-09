import type { Session } from "@supabase/supabase-js";
import type { UserRole } from "../types/models";

export type AppAuthUser = { id: string; fullName: string; role: UserRole };

export type AppAuthSnapshot = {
  token: string | null;
  user: AppAuthUser | null;
};

function mapUserRole(metadata: Record<string, unknown> | undefined): UserRole {
  const roleRaw = typeof metadata?.role === "string" ? metadata.role.toLowerCase() : "";
  if (roleRaw === "admin") return "admin";
  if (roleRaw === "manager") return "manager";
  return "salesperson";
}

/** Display name from Supabase user_metadata or email — no hard-coded demo identity. */
function displayNameFromSession(
  metadata: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  const name = metadata?.full_name;
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  if (email && email.includes("@")) return email.split("@")[0] ?? email;
  if (email?.trim()) return email.trim();
  return "User";
}

/** Single place to map Supabase session → app auth (login, restore, token refresh). */
export function mapSessionToSnapshot(session: Session | null): AppAuthSnapshot {
  if (!session?.access_token || !session.user) {
    return { token: null, user: null };
  }
  const authUser = session.user;
  const metadata = authUser.user_metadata as Record<string, unknown> | undefined;
  return {
    token: session.access_token,
    user: {
      id: authUser.id,
      fullName: displayNameFromSession(metadata, authUser.email),
      role: mapUserRole(metadata),
    },
  };
}
