import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { LeadAvatar } from "../components/LeadAvatar";
import { FollowUpsSkeleton } from "../components/FollowUpsSkeleton";
import { SetFollowUpButton } from "../components/SetFollowUpButton";
import { useToast } from "../context/ToastContext";
import {
  classifyFollowUpDue,
  clearLeadFollowUp,
  fetchLeadsOrderedByFollowUp,
  formatFollowUpDueAtTime,
  formatFollowUpOverdueHuman,
  formatFollowUpUpcomingRelative,
  isFollowUpInUpcomingSevenDayWindow,
} from "../lib/leadFollowUp";
import { formatSafeDateTime, isLeadNameMissing, leadDisplayName } from "../lib/safeData";
import {
  digitsOnlyPhone,
  normalizePhoneForWaMeWithPrefix,
  openWhatsAppForPhone,
} from "../lib/whatsapp";
import {
  formatYmdInTimeZone,
  gregorianMinusOneDay,
  zonedDayRangeContaining,
  zonedMidnightUtc,
} from "../lib/zonedTime";
import { isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import type { MainTabScreenProps } from "../navigation/types";
import { api } from "../services/api";
import { mockLeads } from "../services/mockData";
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { useAuthStore } from "../state/useAuthStore";
import type { InboxLeadRow } from "../types/models";
import { colors } from "../theme/colors";

type Props = MainTabScreenProps<"FollowUps">;

/** Follow-up buckets and labels use Pakistan wall time (product default), not device local. */
const FOLLOW_UPS_TIMEZONE = "Asia/Karachi";

function sortByFollowUpTime(rows: InboxLeadRow[]): InboxLeadRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.next_follow_up_at ? new Date(a.next_follow_up_at).getTime() : Infinity;
    const tb = b.next_follow_up_at ? new Date(b.next_follow_up_at).getTime() : Infinity;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

function partitionFollowUps(
  items: InboxLeadRow[],
  timeZone: string,
): { overdue: InboxLeadRow[]; today: InboxLeadRow[]; upcoming7: InboxLeadRow[] } {
  const tz = timeZone?.trim() || "Asia/Karachi";
  const overdue: InboxLeadRow[] = [];
  const today: InboxLeadRow[] = [];
  const upcoming7: InboxLeadRow[] = [];

  for (const lead of items) {
    const kind = classifyFollowUpDue(lead.next_follow_up_at, tz);
    if (kind === "overdue") {
      overdue.push(lead);
      continue;
    }
    if (kind === "today") {
      today.push(lead);
      continue;
    }
    if (kind === "upcoming" && isFollowUpInUpcomingSevenDayWindow(lead.next_follow_up_at, tz)) {
      upcoming7.push(lead);
    }
  }

  return {
    overdue: sortByFollowUpTime(overdue),
    today: sortByFollowUpTime(today),
    upcoming7: sortByFollowUpTime(upcoming7),
  };
}

export function FollowUpsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
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

  const [items, setItems] = useState<InboxLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  const groups = useMemo(() => partitionFollowUps(items, FOLLOW_UPS_TIMEZONE), [items]);

  const hasAnyInSections =
    groups.overdue.length > 0 || groups.today.length > 0 || groups.upcoming7.length > 0;

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setError(null);
      return;
    }
    if (api.demoMode) {
      const tz = FOLLOW_UPS_TIMEZONE;
      const now = new Date();
      const { start: startToday, endExclusive: endToday } = zonedDayRangeContaining(now, tz);
      const todayYmd = formatYmdInTimeZone(now, tz);
      const [y, m, d] = todayYmd.split("-").map(Number);
      const [py, pm, pd] = gregorianMinusOneDay(y, m, d);
      const [ppy, ppm, ppd] = gregorianMinusOneDay(py, pm, pd);
      const overdueAt = new Date(zonedMidnightUtc(ppy, ppm, ppd, tz).getTime() + 9 * 3600000);
      const todayDue = new Date(startToday.getTime() + (14 * 60 + 30) * 60 * 1000);
      const inWeek = new Date(endToday.getTime() + 3 * 24 * 60 * 60 * 1000);
      const far = new Date(endToday.getTime() + 14 * 24 * 60 * 60 * 1000);
      const demo: InboxLeadRow[] = [
        {
          id: "demo-fu-1",
          name: mockLeads[0]?.fullName ?? "Demo lead",
          phone: "+923001234567",
          next_follow_up_at: overdueAt.toISOString(),
          status: "new",
          priority: "medium",
        },
        {
          id: "demo-fu-2",
          name: "Due today (demo)",
          phone: "+923001111111",
          next_follow_up_at: todayDue.toISOString(),
          status: "contacted",
          priority: "high",
        },
        {
          id: "demo-fu-3",
          name: "This week",
          phone: "+923002222222",
          next_follow_up_at: inWeek.toISOString(),
          status: "qualified",
          priority: "low",
        },
        {
          id: "demo-fu-4",
          name: "Far future",
          next_follow_up_at: far.toISOString(),
          status: "new",
          priority: "medium",
        },
      ];
      setItems(sortByFollowUpTime(demo));
      setError(null);
      return;
    }
    if (!isSupabaseConfigured()) {
      setItems([]);
      setError(supabaseEnvError ?? "Supabase is not configured.");
      return;
    }
    const rows = await fetchLeadsOrderedByFollowUp();
    setItems(rows);
    setError(null);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          setLoading(true);
          await load();
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Could not load follow-ups.");
            setItems([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  useEffect(() => {
    if (leadsDataRevision === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load follow-ups.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadsDataRevision, load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onFollowUpSaved = useCallback((leadId: string, iso: string) => {
    setItems((prev) =>
      sortByFollowUpTime(
        prev.map((l) => (l.id === leadId ? { ...l, next_follow_up_at: iso } : l)),
      ),
    );
    bumpLeadsDataRevision();
  }, [bumpLeadsDataRevision]);

  const onMarkDone = useCallback(
    (lead: InboxLeadRow) => {
      const id = lead.id?.trim();
      if (!id || markingDoneId) return;
      if (api.demoMode) {
        setItems((prev) => prev.filter((l) => l.id !== id));
        showToast("Follow-up cleared", "success");
        bumpLeadsDataRevision();
        return;
      }
      void (async () => {
        setMarkingDoneId(id);
        try {
          await clearLeadFollowUp(id);
          setItems((prev) => prev.filter((l) => l.id !== id));
          showToast("Marked as done", "success");
          bumpLeadsDataRevision();
        } catch (e) {
          showToast(e instanceof Error ? e.message : "Could not update lead.", "error");
        } finally {
          setMarkingDoneId(null);
        }
      })();
    },
    [markingDoneId, showToast, bumpLeadsDataRevision],
  );

  const openWhatsApp = useCallback(
    (lead: InboxLeadRow) => {
      const has = waOpenOpts.countryPrefix
        ? normalizePhoneForWaMeWithPrefix(lead.phone, waOpenOpts.countryPrefix)
        : digitsOnlyPhone(lead.phone);
      if (!has) {
        showToast("No phone number on file.", "error");
        return;
      }
      void (async () => {
        const ok = await openWhatsAppForPhone(lead.phone, waOpts);
        if (ok) showToast("WhatsApp opened", "success");
      })();
    },
    [waOpts, showToast],
  );

  if (loading && items.length === 0) {
    return <FollowUpsSkeleton />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        { paddingBottom: 24 + insets.bottom },
        !error && !hasAnyInSections ? styles.contentEmpty : null,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
      }
    >
      <Text style={styles.title}>Follow-ups</Text>
      <Text style={styles.subtitle}>
        {[
          groups.overdue.length > 0 ? `${groups.overdue.length} overdue` : null,
          groups.today.length > 0 ? `${groups.today.length} today` : null,
          groups.upcoming7.length > 0 ? `${groups.upcoming7.length} upcoming` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No follow-ups in the next week"}
      </Text>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void onRefresh()} accessibilityRole="button">
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}

      {!error && !hasAnyInSections ? (
        <View style={styles.allCaughtUpWrap}>
          <Text style={styles.allCaughtUpTitle}>You're all caught up! 🎉</Text>
          <Text style={styles.allCaughtUpSubtitle}>No follow-ups overdue or scheduled</Text>
        </View>
      ) : null}

      {!error && hasAnyInSections ? (
        <>
          <FollowUpSection
            variant="overdue"
            title="Overdue"
            hint="Past scheduled time"
            leads={groups.overdue}
            timeZone={FOLLOW_UPS_TIMEZONE}
            navigation={navigation}
            waOpenOpts={waOpenOpts}
            onWhatsApp={openWhatsApp}
            onMarkDone={onMarkDone}
            onFollowUpSaved={onFollowUpSaved}
            markingDoneId={markingDoneId}
          />
          <FollowUpSection
            variant="today"
            title="Today"
            hint="Scheduled for today"
            leads={groups.today}
            timeZone={FOLLOW_UPS_TIMEZONE}
            navigation={navigation}
            waOpenOpts={waOpenOpts}
            onWhatsApp={openWhatsApp}
            onMarkDone={onMarkDone}
            onFollowUpSaved={onFollowUpSaved}
            markingDoneId={markingDoneId}
          />
          <FollowUpSection
            variant="upcoming"
            title="Upcoming"
            hint="Next 7 days"
            leads={groups.upcoming7}
            timeZone={FOLLOW_UPS_TIMEZONE}
            navigation={navigation}
            waOpenOpts={waOpenOpts}
            onWhatsApp={openWhatsApp}
            onMarkDone={onMarkDone}
            onFollowUpSaved={onFollowUpSaved}
            markingDoneId={markingDoneId}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

type SectionVariant = "overdue" | "today" | "upcoming";

type SectionProps = {
  variant: SectionVariant;
  title: string;
  hint: string;
  leads: InboxLeadRow[];
  timeZone: string;
  navigation: MainTabScreenProps<"FollowUps">["navigation"];
  waOpenOpts: { countryPrefix?: string };
  onWhatsApp: (lead: InboxLeadRow) => void;
  onMarkDone: (lead: InboxLeadRow) => void;
  onFollowUpSaved: (leadId: string, iso: string) => void;
  markingDoneId: string | null;
};

function sectionDotStyle(v: SectionVariant) {
  if (v === "overdue") return styles.dotOverdue;
  if (v === "today") return styles.dotToday;
  return styles.dotUpcoming;
}

function leadCardVariantStyle(v: SectionVariant) {
  if (v === "overdue") return styles.leadCardOverdue;
  if (v === "today") return styles.leadCardToday;
  return styles.leadCardUpcoming;
}

function scheduleAccentColor(v: SectionVariant): string {
  if (v === "overdue") return colors.danger;
  if (v === "today") return colors.warning;
  return colors.success;
}

function FollowUpSection({
  variant,
  title,
  hint,
  leads,
  timeZone,
  navigation,
  waOpenOpts,
  onWhatsApp,
  onMarkDone,
  onFollowUpSaved,
  markingDoneId,
}: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionDot, sectionDotStyle(variant)]} accessibilityElementsHidden />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Text style={styles.sectionHint}>{hint}</Text>
      </View>
      {leads.length === 0 ? (
        variant === "today" ? (
          <Text style={styles.sectionEmptyToday}>No follow-ups due today</Text>
        ) : variant === "upcoming" ? (
          <Text style={styles.sectionEmptyUpcoming}>No upcoming follow-ups in the next 7 days</Text>
        ) : (
          <Text style={styles.sectionEmptyOverdue}>None</Text>
        )
      ) : null}
      {leads.map((lead) => {
        const id = lead.id?.trim();
        if (!id) return null;
        const accentColor = scheduleAccentColor(variant);
        const scheduled =
          variant === "overdue"
            ? formatSafeDateTime(lead.next_follow_up_at, "—")
            : variant === "today"
              ? formatFollowUpDueAtTime(lead.next_follow_up_at, timeZone)
              : formatFollowUpUpcomingRelative(lead.next_follow_up_at, timeZone);
        const overdueLine =
          variant === "overdue" ? formatFollowUpOverdueHuman(lead.next_follow_up_at) : "";
        const canWa = !!(
          waOpenOpts.countryPrefix
            ? normalizePhoneForWaMeWithPrefix(lead.phone, waOpenOpts.countryPrefix)
            : digitsOnlyPhone(lead.phone)
        );
        const busyDone = markingDoneId === id;

        return (
          <Card key={id} style={[styles.leadCard, leadCardVariantStyle(variant)]}>
            <Pressable
              onPress={() => navigation.navigate("LeadDetail", { leadId: id })}
              accessibilityRole="button"
              accessibilityLabel={`Open ${leadDisplayName(lead.name)}`}
            >
              <View style={styles.leadTop}>
                <LeadAvatar name={lead.name} />
                <View style={styles.leadTopText}>
                  <Text
                    style={[styles.name, isLeadNameMissing(lead.name) && styles.nameMuted]}
                    numberOfLines={2}
                  >
                    {leadDisplayName(lead.name)}
                  </Text>
                  <View style={styles.scheduleRow}>
                    <Ionicons name="time-outline" size={16} color={accentColor} />
                    <Text
                      style={[
                        styles.scheduleText,
                        variant === "overdue" && styles.scheduleTextOverdue,
                        variant === "today" && styles.scheduleTextToday,
                        variant === "upcoming" && styles.scheduleTextUpcoming,
                      ]}
                    >
                      {scheduled}
                    </Text>
                  </View>
                  {overdueLine ? (
                    <Text style={styles.overdueHuman}>{overdueLine}</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>

            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnWa, !canWa && styles.actionBtnDisabled, pressed && styles.pressed]}
                onPress={() => onWhatsApp(lead)}
                disabled={!canWa}
                accessibilityRole="button"
                accessibilityLabel="WhatsApp"
              >
                <Ionicons name="logo-whatsapp" size={18} color={canWa ? "#fff" : colors.textMuted} />
                <Text style={[styles.actionBtnLabel, !canWa && styles.actionBtnLabelMuted]}>WhatsApp</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, styles.actionBtnDone, pressed && styles.pressed, busyDone && styles.actionBtnDisabled]}
                onPress={() => onMarkDone(lead)}
                disabled={busyDone}
                accessibilityRole="button"
                accessibilityLabel="Mark done"
              >
                {busyDone ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.text} />
                    <Text style={styles.actionBtnLabel}>Mark done</Text>
                  </>
                )}
              </Pressable>
              <View style={styles.rescheduleWrap}>
                <SetFollowUpButton
                  leadId={id}
                  nextFollowUpAt={lead.next_follow_up_at}
                  compact
                  label="Reschedule"
                  disabled={busyDone}
                  onSaved={(iso) => onFollowUpSaved(id, iso)}
                />
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  contentEmpty: { flexGrow: 1, justifyContent: "center", minHeight: 320 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, marginBottom: 16, fontSize: 14, lineHeight: 20 },
  section: { marginBottom: 8 },
  sectionHeader: { marginBottom: 10, marginTop: 4 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  dotOverdue: { backgroundColor: colors.danger },
  dotToday: { backgroundColor: colors.warning },
  dotUpcoming: { backgroundColor: colors.success },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  sectionEmptyToday: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  sectionEmptyUpcoming: {
    color: colors.textMuted,
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  sectionEmptyOverdue: { color: colors.textMuted, fontSize: 14, fontStyle: "italic", marginBottom: 8, paddingLeft: 2 },
  allCaughtUpWrap: { alignItems: "center", marginTop: 60 },
  allCaughtUpTitle: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  allCaughtUpSubtitle: { color: colors.textMuted, fontSize: 14, marginTop: 8 },
  leadCard: {
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    paddingBottom: 12,
  },
  leadCardOverdue: {
    borderLeftColor: colors.danger,
    backgroundColor: colors.cardSoft,
  },
  leadCardToday: {
    borderLeftColor: colors.warning,
    backgroundColor: colors.cardSoft,
  },
  leadCardUpcoming: {
    borderLeftColor: colors.success,
    backgroundColor: colors.cardSoft,
  },
  leadTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  leadTopText: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontWeight: "700", fontSize: 17 },
  nameMuted: { color: colors.textMuted, fontWeight: "600" },
  scheduleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  scheduleText: { color: colors.textMuted, fontSize: 15, fontWeight: "600", flex: 1 },
  scheduleTextOverdue: { color: colors.danger },
  scheduleTextToday: { color: colors.warning },
  scheduleTextUpcoming: { color: colors.success },
  overdueHuman: { color: colors.danger, fontSize: 14, fontWeight: "700", marginTop: 6 },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    minHeight: 40,
  },
  actionBtnWa: { backgroundColor: "#128C7E" },
  actionBtnDone: { backgroundColor: colors.cardSoft, borderWidth: 1, borderColor: colors.border },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnLabel: { color: colors.text, fontWeight: "800", fontSize: 13 },
  actionBtnLabelMuted: { color: colors.textMuted },
  rescheduleWrap: { marginLeft: "auto" },
  pressed: { opacity: 0.88 },
  errorCard: { borderColor: colors.danger, marginBottom: 12 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  retryLabel: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
