import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShowToastOptions } from "../context/ToastContext";

type ShowToastFn = (message: string, type: "info" | "success" | "error", options?: ShowToastOptions) => void;

/**
 * Deletes a lead after loading a full-row snapshot; shows toast with optional Undo (re-insert).
 */
export async function deleteLeadWithUndoToast(
  supabase: SupabaseClient,
  leadId: string,
  showToast: ShowToastFn,
  onSuccess: () => void | Promise<void>,
): Promise<void> {
  const { data: snap, error: fetchErr } = await supabase.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (fetchErr) {
    showToast(fetchErr.message, "error");
    return;
  }
  if (!snap || typeof snap !== "object") {
    showToast("Lead not found.", "error");
    return;
  }

  const { error: delErr } = await supabase.from("leads").delete().eq("id", leadId);
  if (delErr) {
    showToast(delErr.message, "error");
    return;
  }

  await onSuccess();

  const snapshot = snap as Record<string, unknown>;
  showToast("Lead deleted", "error", {
    onUndo: async () => {
      const { error: insErr } = await supabase.from("leads").insert([snapshot]);
      if (insErr) {
        showToast(insErr.message, "error");
        return;
      }
      await onSuccess();
    },
  });
}
