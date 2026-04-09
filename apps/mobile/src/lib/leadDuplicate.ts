import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnlyPhone } from "./whatsapp";

function nameMatches(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** When digits normalization fails, compare trimmed raw strings (short numbers, extensions). */
function phonesEquivalent(stored: string | null | undefined, inputTrimmed: string): boolean {
  const ds = digitsOnlyPhone(stored);
  const di = digitsOnlyPhone(inputTrimmed);
  if (ds && di) return ds === di;
  const s = typeof stored === "string" ? stored.trim() : "";
  const i = inputTrimmed.trim();
  if (s !== "" && i !== "") return s === i;
  return false;
}

/**
 * Returns an existing lead id if another row has the same name (case-insensitive) and equivalent phone.
 * Scoped to `workspace_id`. If `phoneInput` is empty, returns null (no check).
 */
export async function findDuplicateLeadByNameAndPhone(
  supabase: SupabaseClient,
  workspaceId: string,
  nameTrimmed: string,
  phoneInput: string,
): Promise<{ id: string } | null> {
  const phoneTrim = phoneInput.trim();
  if (!nameTrimmed) return null;
  if (!phoneTrim) return null;

  const { data, error } = await supabase
    .from("leads")
    .select("id,name,phone")
    .eq("workspace_id", workspaceId);

  if (error || !data?.length) return null;

  for (const row of data) {
    if (typeof row.id !== "string" || !row.id) continue;
    const n = typeof row.name === "string" ? row.name : "";
    if (!nameMatches(n, nameTrimmed)) continue;
    if (phonesEquivalent(row.phone, phoneTrim)) return { id: row.id };
  }

  return null;
}

/**
 * Any existing lead with the same phone as the input, scoped to workspace.
 * Tries exact `phone` string match first, then same normalized digits (handles formatting differences).
 */
export async function findExistingLeadByPhone(
  supabase: SupabaseClient,
  workspaceId: string,
  phoneInput: string,
): Promise<{ id: string; name: string | null } | null> {
  const phoneTrim = phoneInput.trim();
  const di = digitsOnlyPhone(phoneInput);
  if (!di) return null;

  const { data: exact } = await supabase
    .from("leads")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .eq("phone", phoneTrim)
    .limit(1)
    .maybeSingle();

  if (exact && typeof exact.id === "string" && exact.id) {
    return { id: exact.id, name: typeof exact.name === "string" ? exact.name : null };
  }

  const { data, error } = await supabase.from("leads").select("id, name, phone").eq("workspace_id", workspaceId);
  if (error || !data?.length) return null;

  for (const row of data) {
    if (typeof row.id !== "string" || !row.id) continue;
    if (digitsOnlyPhone(row.phone) === di) {
      return { id: row.id, name: typeof row.name === "string" ? row.name : null };
    }
  }
  return null;
}
