import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { useToast } from "../context/ToastContext";
import { crossPlatformConfirm } from "../lib/crossPlatformConfirm";
import {
  type DuplicateGroup,
  fetchDuplicateGroups,
} from "../lib/leadDuplicateGroups";
import { deleteLeadWithUndoToast } from "../lib/leadUndoDelete";
import { formatSafeDateTime } from "../lib/safeData";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import type { RootStackScreenProps } from "../navigation/types";
import { useAppStore } from "../state/useAppStore";
import { colors } from "../theme/colors";

type Props = RootStackScreenProps<"DuplicateLeadsReview">;

export function DuplicateLeadsReviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError(supabaseEnvError ?? "Supabase is not configured.");
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const g = await fetchDuplicateGroups(supabase);
      setGroups(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load duplicates.");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(
    (leadId: string, label: string) => {
      crossPlatformConfirm(
        "Delete lead",
        `Remove this duplicate entry (${label})? This cannot be undone.`,
        () => {
          void (async () => {
            if (!isSupabaseConfigured()) return;
            setDeletingId(leadId);
            try {
              const supabase = getSupabaseClient();
              await deleteLeadWithUndoToast(supabase, leadId, showToast, async () => {
                bumpLeadsDataRevision();
                await load();
              });
            } finally {
              setDeletingId(null);
            }
          })();
        },
        "Delete",
      );
    },
    [load, bumpLeadsDataRevision, showToast],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.subtitle}>
        Same name and phone as another lead. Delete extras and keep one row per person.
      </Text>

      {!isSupabaseConfigured() ? (
        <Text style={styles.err}>{supabaseEnvError ?? "Supabase is not configured."}</Text>
      ) : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.hint}>Loading…</Text>
        </View>
      ) : groups.length === 0 ? (
        <Card>
          <Text style={styles.empty}>No duplicate groups found.</Text>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.key} style={styles.groupCard}>
            <Text style={styles.groupTitle} numberOfLines={2}>
              {g.displayName}
            </Text>
            <Text style={styles.groupPhone}>{g.displayPhone}</Text>
            <Text style={styles.groupMeta}>{g.leads.length} matching leads</Text>
            <View style={styles.divider} />
            {g.leads.map((lead) => {
              const busy = deletingId === lead.id;
              const when = formatSafeDateTime(lead.created_at, "—");
              return (
                <View key={lead.id} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowDate}>{when}</Text>
                    <Text style={styles.rowId} numberOfLines={1}>
                      {lead.id}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.deleteBtn, (pressed || busy) && styles.deleteBtnPressed]}
                    onPress={() => onDelete(lead.id, when)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete duplicate from ${when}`}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </Card>
        ))
      )}

      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryBtnText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  subtitle: { color: colors.textMuted, marginBottom: 16, fontSize: 14, lineHeight: 20 },
  err: { color: colors.danger, marginBottom: 12, fontSize: 14 },
  centered: { paddingVertical: 40, alignItems: "center" },
  hint: { color: colors.textMuted, marginTop: 10, fontSize: 14 },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: "center", paddingVertical: 20 },
  groupCard: { marginBottom: 14 },
  groupTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  groupPhone: { color: colors.primary, fontSize: 15, fontWeight: "600", marginTop: 4 },
  groupMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowDate: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowId: { color: colors.textMuted, fontSize: 11, marginTop: 4, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  deleteBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  deleteBtnPressed: { opacity: 0.9 },
  deleteBtnText: { color: colors.text, fontWeight: "800", fontSize: 13 },
  secondaryBtn: { marginTop: 20, paddingVertical: 14, alignItems: "center" },
  secondaryBtnPressed: { opacity: 0.85 },
  secondaryBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 15 },
});
