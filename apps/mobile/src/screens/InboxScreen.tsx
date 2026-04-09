import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItem,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddLeadFab } from "../components/AddLeadFab";
import { Card } from "../components/Card";
import { LeadAvatar } from "../components/LeadAvatar";
import { LeadCardAiReplyButton } from "../components/LeadCardAiReplyButton";
import { SetFollowUpButton } from "../components/SetFollowUpButton";
import { useToast } from "../context/ToastContext";
import {
  digitsOnlyPhone,
  normalizePhoneForWaMeWithPrefix,
  openWhatsAppForPhone,
} from "../lib/whatsapp";
import { formatLeadPriorityDisplay } from "../lib/leadPriority";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import { getSourceLabel } from "../lib/sourceLabels";
import { filterValidInboxLeads, isLeadNameMissing, leadDisplayName } from "../lib/safeData";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import { openLeadDetailWithAiFocus } from "../navigation/openLeadDetailWithAiFocus";
import type { MainTabScreenProps } from "../navigation/types";
import type { InboxLeadRow } from "../types/models";
import { colors } from "../theme/colors";
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";

type Props = MainTabScreenProps<"Inbox">;

function previewText(lead: InboxLeadRow): string {
  return lead.notes?.trim() || "No notes yet.";
}

export function InboxScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const leadsDataRevision = useAppStore((s) => s.leadsDataRevision);
  const whatsAppCountryCode = useAppPreferencesStore((s) => s.whatsAppCountryCode);
  const waOpenOpts = useMemo(
    () => ({ countryPrefix: whatsAppCountryCode.trim() ? whatsAppCountryCode : undefined }),
    [whatsAppCountryCode],
  );
  const waOpts = useMemo(
    () => ({
      ...waOpenOpts,
      feedback: { error: (m: string) => showToast(m, "error") },
    }),
    [waOpenOpts, showToast],
  );
  const [leads, setLeads] = useState<InboxLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError(supabaseEnvError ?? "Supabase is not configured.");
      setLeads([]);
      return;
    }
    const supabase = getSupabaseClient();
    const { data, error: fetchError } = await supabase
      .from("leads")
      .select("id,name,phone,email,source,source_channel,status,priority,notes,city,created_at,next_follow_up_at")
      .order("created_at", { ascending: false });
    if (fetchError) {
      throw new Error(fetchError.message);
    }
    const raw = (data ?? []) as InboxLeadRow[];
    setLeads(filterValidInboxLeads(raw));
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        await loadLeads();
      } catch (e) {
        if (active) {
          const message = e instanceof Error ? e.message : "Failed to load leads.";
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadLeads, leadsDataRevision]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadLeads();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to refresh.";
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [loadLeads]);

  const onFollowUpSaved = useCallback((leadId: string, iso: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, next_follow_up_at: iso } : l)));
  }, []);

  /** Same AI entry as Pipeline cards: Lead Detail with AI section focused (see {@link openLeadDetailWithAiFocus}). */
  const onPressAiReply = useCallback(
    (leadId: string) => {
      const lid = leadId?.trim();
      if (!lid) {
        showToast("Could not open AI reply for this lead.", "error");
        return;
      }
      openLeadDetailWithAiFocus(navigation, lid);
    },
    [navigation, showToast],
  );

  const renderItem: ListRenderItem<InboxLeadRow> = useCallback(
    ({ item: lead }) => {
      const id = lead?.id?.trim();
      if (!id) return null;
      const hasPhone = !!(
        waOpenOpts.countryPrefix
          ? normalizePhoneForWaMeWithPrefix(lead.phone, waOpenOpts.countryPrefix)
          : digitsOnlyPhone(lead.phone)
      );
      return (
        <Card style={styles.leadCard}>
          <Pressable
            onPress={() => navigation.navigate("LeadDetail", { leadId: id })}
            accessibilityRole="button"
            accessibilityLabel={`Lead ${leadDisplayName(lead.name)}, view details`}
          >
            <View style={styles.cardNameRow}>
              <LeadAvatar name={lead.name} size={44} />
              <View style={styles.cardMainCol}>
                <Text
                  style={[styles.name, styles.nameBesideAvatar, isLeadNameMissing(lead.name) && styles.nameMuted]}
                  numberOfLines={2}
                >
                  {leadDisplayName(lead.name)}
                </Text>
                <Text style={styles.meta}>
                  {getSourceLabel(lead.source_channel ?? lead.source)} · {formatLeadPriorityDisplay(lead.priority)}
                </Text>
                {lead.status ? (
                  <Text style={styles.statusBadge}>{formatLeadStageLabel(lead.status)}</Text>
                ) : null}
                <Text style={styles.message} numberOfLines={3}>
                  {previewText(lead)}
                </Text>
              </View>
            </View>
          </Pressable>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, !hasPhone && styles.iconBtnMuted, pressed && styles.pressed]}
              onPress={() => void openWhatsAppForPhone(lead.phone, waOpts)}
              accessibilityLabel="WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={22} color={hasPhone ? "#25D366" : colors.textMuted} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              onPress={() => navigation.navigate("EditLead", { leadId: id })}
              accessibilityLabel="Edit lead"
            >
              <Ionicons name="create-outline" size={22} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.followUpAndAiColumn}>
            <SetFollowUpButton
              leadId={id}
              nextFollowUpAt={lead.next_follow_up_at}
              compact
              onSaved={(iso) => onFollowUpSaved(id, iso)}
            />
            <LeadCardAiReplyButton onPress={() => onPressAiReply(id)} />
          </View>
          <Pressable
            style={({ pressed }) => [styles.detailsBtn, pressed && styles.pressed]}
            onPress={() => navigation.navigate("LeadDetail", { leadId: id })}
            accessibilityRole="button"
            accessibilityLabel="View details"
          >
            <Text style={styles.detailsBtnText}>View details</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </Card>
      );
    },
    [navigation, onFollowUpSaved, onPressAiReply, waOpenOpts, waOpts],
  );

  const keyExtractor = useCallback((item: InboxLeadRow, index: number) => {
    const id = item?.id?.trim();
    return id && id.length > 0 ? id : `lead-row-${index}`;
  }, []);

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.subtitle}>Leads from your workspace</Text>
      {loading && !refreshing ? <Text style={styles.hint}>Loading…</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={styles.page}>
      <FlatList
        data={leads}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 96 + insets.bottom },
          leads.length === 0 && !loading ? styles.listEmpty : null,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
        }
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>📬</Text>
              <Text style={styles.emptyTitle}>Your inbox is empty</Text>
              <Text style={styles.emptySubtitle}>New leads will appear here</Text>
            </View>
          ) : null
        }
      />
      <AddLeadFab />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  leadCard: { marginBottom: 4 },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    maxWidth: "100%",
  },
  cardMainCol: { flex: 1, minWidth: 0 },
  nameBesideAvatar: { flex: 1, minWidth: 0 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnMuted: { opacity: 0.75 },
  detailsBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  followUpAndAiColumn: { marginTop: 10, gap: 8 },
  pressed: { opacity: 0.88 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  header: { marginBottom: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, fontSize: 15 },
  hint: { color: colors.textMuted, marginTop: 10 },
  name: { color: colors.text, fontSize: 17, fontWeight: "700" },
  nameMuted: { color: colors.textMuted, fontWeight: "600" },
  meta: { color: colors.textMuted, marginTop: 6, fontSize: 14 },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  message: { color: colors.text, marginTop: 10, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, marginTop: 12 },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    minHeight: 280,
  },
  emptyEmoji: {
    fontSize: 52,
    lineHeight: 58,
    marginBottom: 14,
    opacity: 0.85,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 24,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 320,
  },
});
