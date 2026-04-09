import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { AddLeadFab } from "../components/AddLeadFab";
import { Card } from "../components/Card";
import { KpiCard, type KpiTrend } from "../components/KpiCard";
import { LoadingScreen } from "../components/LoadingScreen";
import { DashboardCharts } from "../components/DashboardCharts";
import { DashboardInsights } from "../components/DashboardInsights";
import { LeadSourcesSection } from "../components/LeadSourcesSection";
import { FollowUpOverdueAlert } from "../components/FollowUpOverdueAlert";
import { PipelineOverviewSection } from "../components/PipelineOverviewSection";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import { formatPkrEnIn } from "../lib/dealValue";
import {
  emptyDashboardAnalytics,
  fetchLeadsLast7DaysSeries,
  leadsLast7DaysToChartData,
  loadDashboardAnalytics,
  type ChartDataPoint,
} from "../lib/dashboardAnalytics";
import { calculateLeadScore, getScoreEmoji, inboxLeadToScoreInput } from "../lib/leadScoring";
import { filterValidInboxLeads, leadDisplayName } from "../lib/safeData";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import type { MainTabScreenProps } from "../navigation/types";
import { api } from "../services/api";
import { countMyAiRepliesInLastDays } from "../services/leadAiRepliesRepository";
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { useAuthStore } from "../state/useAuthStore";
import { colors } from "../theme/colors";
import type { AnalyticsDashboard, InboxLeadRow } from "../types/models";

type Props = MainTabScreenProps<"Dashboard">;

const emptyDashboard = emptyDashboardAnalytics();

const REFRESH_MS = 10_000;

async function fetchTopHotLeads(): Promise<InboxLeadRow[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,name,phone,email,source,source_channel,status,priority,notes,city,created_at,next_follow_up_at",
      )
      .limit(500);
    if (error) return [];
    const rows = filterValidInboxLeads((data ?? []) as InboxLeadRow[]);
    return rows
      .map((r) => {
        const { score } = calculateLeadScore(inboxLeadToScoreInput(r));
        return { row: r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ row, score }) => ({ ...row, lead_score: score }));
  } catch {
    return [];
  }
}

export function DashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const setStoreAnalytics = useAppStore((s) => s.setAnalytics);
  const leadsDataRevision = useAppStore((s) => s.leadsDataRevision);
  const appTimeZone = useAppPreferencesStore((s) => s.timeZone);

  const [analytics, setAnalyticsState] = useState<AnalyticsDashboard>(() => emptyDashboardAnalytics());
  const [chartPoints, setChartPoints] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiReplies30d, setAiReplies30d] = useState<number | null>(null);
  const [hotLeads, setHotLeads] = useState<InboxLeadRow[]>([]);

  const fetchDashboardDataRef = useRef<() => Promise<void>>(async () => { });
  const dashboardFetchedOnceRef = useRef(false);
  const prevFollowUpsRef = useRef<number | null>(null);
  const prevConversionRateRef = useRef<number | null>(null);

  const user = useAuthStore((s) => s.user);
  const isManager = user?.role === "admin" || user?.role === "manager";

  const fetchDashboardData = useCallback(async () => {
    let nextAnalytics: AnalyticsDashboard = emptyDashboardAnalytics();
    let nextChartPoints: ChartDataPoint[] = [];
    let apiErr: string | null = null;

    try {
      try {
        const [dashResult, series, hot] = await Promise.all([
          loadDashboardAnalytics({
            demoMode: api.demoMode,
            supabaseConfigured: isSupabaseConfigured(),
            getApiDashboard: () => api.getAnalyticsDashboard(),
          }),
          fetchLeadsLast7DaysSeries({
            demoMode: api.demoMode,
            supabaseConfigured: isSupabaseConfigured(),
            timeZone: appTimeZone,
          }),
          fetchTopHotLeads(),
        ]);
        nextAnalytics = dashResult.dashboard ?? emptyDashboardAnalytics();
        apiErr = dashResult.apiError;
        nextChartPoints = leadsLast7DaysToChartData(series);
        setHotLeads(Array.isArray(hot) ? hot : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        nextAnalytics = emptyDashboardAnalytics();
        nextChartPoints = [];
        apiErr = msg;
        setHotLeads([]);
      }

      setAnalyticsState(nextAnalytics);
      setChartPoints(Array.isArray(nextChartPoints) ? nextChartPoints : []);
      setStoreAnalytics(nextAnalytics);
      setError(apiErr);

      try {
        if (isSupabaseConfigured()) {
          const n = await countMyAiRepliesInLastDays(30);
          setAiReplies30d(n);
        } else {
          setAiReplies30d(null);
        }
      } catch {
        setAiReplies30d(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyticsState(emptyDashboardAnalytics());
      setChartPoints([]);
      setStoreAnalytics(emptyDashboardAnalytics());
      setError(msg);
      setAiReplies30d(null);
      setHotLeads([]);
    }
  }, [setStoreAnalytics, appTimeZone]);

  fetchDashboardDataRef.current = fetchDashboardData;

  /** Refetch when the Dashboard tab/screen is shown (avoids stale “New Today” and other KPIs). */
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const first = !dashboardFetchedOnceRef.current;
        if (first) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        try {
          await fetchDashboardDataRef.current();
          dashboardFetchedOnceRef.current = true;
        } catch {
          /* ignore */
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      })();
    }, []),
  );

  const manualRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboardDataRef.current();
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void (async () => {
        setRefreshing(true);
        try {
          await fetchDashboardDataRef.current();
        } catch {
          /* ignore */
        } finally {
          setRefreshing(false);
        }
      })();
    }, REFRESH_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (leadsDataRevision === 0) return;
    void (async () => {
      setRefreshing(true);
      try {
        await fetchDashboardDataRef.current();
      } catch {
        /* ignore */
      } finally {
        setRefreshing(false);
      }
    })();
  }, [leadsDataRevision]);

  useEffect(() => {
    if (loading) return;
    const t = analytics.totals;
    const fu =
      typeof t?.followUpsDue === "number" && Number.isFinite(t.followUpsDue) ? t.followUpsDue : 0;
    prevFollowUpsRef.current = fu;
  }, [loading, analytics]);

  useEffect(() => {
    if (loading) return;
    const raw = analytics.conversionRate;
    const r =
      raw === null || raw === undefined
        ? null
        : typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : null;
    if (r !== null) prevConversionRateRef.current = r;
  }, [loading, analytics]);

  if (loading) {
    return <LoadingScreen message="Loading dashboard…" />;
  }

  const safeAnalytics = analytics;
  const totals = safeAnalytics?.totals;
  const byStatus = safeAnalytics?.byStatus ?? emptyDashboard.byStatus;
  const bySource =
    safeAnalytics?.bySource?.length ? safeAnalytics.bySource : emptyDashboard.bySource;
  const pipelineValueByStage =
    safeAnalytics?.pipelineValueByStage ?? emptyDashboard.pipelineValueByStage ?? null;
  const pipelineDealCurrency = safeAnalytics?.pipelineDealCurrency ?? "PKR";
  const pvRow = pipelineValueByStage ?? { new: 0, contacted: 0, qualified: 0, closed: 0 };
  const pipelineOpenTotal = pvRow.new + pvRow.contacted + pvRow.qualified;

  const rawRate = safeAnalytics?.conversionRate;
  const rate: number | null =
    rawRate === null || rawRate === undefined
      ? null
      : typeof rawRate === "number" && Number.isFinite(rawRate)
        ? rawRate
        : null;
  const conversionValueLabel = rate === null ? "N/A" : `${rate.toFixed(1)}%`;

  const safeTotals = {
    totalLeads:
      typeof totals?.totalLeads === "number" && Number.isFinite(totals.totalLeads) ? totals.totalLeads : 0,
    leadsToday:
      typeof totals?.leadsToday === "number" && Number.isFinite(totals.leadsToday) ? totals.leadsToday : 0,
    followUpsDue:
      typeof totals?.followUpsDue === "number" && Number.isFinite(totals.followUpsDue)
        ? totals.followUpsDue
        : 0,
  };

  /** Semantic bottom borders: info / good / warning; icons + values use same family. */
  const kpi = {
    total: { accent: colors.primary, bottom: colors.primary },
    newToday: { accent: colors.success, bottom: colors.success },
    followUps: { accent: colors.warning, bottom: colors.warning },
    conversion: { accent: colors.success, bottom: colors.success },
  } as const;

  const weekNewLeadsSum = chartPoints.reduce((sum, p) => sum + (typeof p.count === "number" ? p.count : 0), 0);
  const totalLeadsTrend: KpiTrend = weekNewLeadsSum > 0 ? "up" : "neutral";

  const prevFollowUps = prevFollowUpsRef.current;
  let followUpsTrend: KpiTrend = "neutral";
  if (prevFollowUps !== null) {
    if (safeTotals.followUpsDue > prevFollowUps) followUpsTrend = "up";
    else if (safeTotals.followUpsDue < prevFollowUps) followUpsTrend = "down";
  }

  let newTodayTrend: KpiTrend = "neutral";
  if (chartPoints.length >= 2) {
    const todayBucket = chartPoints[chartPoints.length - 1]?.count ?? 0;
    const yesterdayBucket = chartPoints[chartPoints.length - 2]?.count ?? 0;
    if (todayBucket > yesterdayBucket) newTodayTrend = "up";
    else if (todayBucket < yesterdayBucket) newTodayTrend = "down";
  }

  const prevRate = prevConversionRateRef.current;
  let conversionTrend: KpiTrend = "neutral";
  if (rate !== null && prevRate !== null) {
    if (rate > prevRate) conversionTrend = "up";
    else if (rate < prevRate) conversionTrend = "down";
  }

  const chartsEnabled = Platform.OS !== "web";
  const hasMeaningfulData =
    safeTotals.totalLeads > 0 || safeTotals.followUpsDue > 0 || safeTotals.leadsToday > 0;

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 88 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerTitles}>
            <Text style={styles.title}>Dashboard</Text>
            <Text style={styles.subtitle}>Today's snapshot</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.refreshBtn,
              (refreshing || loading) && styles.refreshBtnDisabled,
              pressed && styles.refreshBtnPressed,
            ]}
            onPress={() => void manualRefresh()}
            disabled={refreshing || loading}
            accessibilityRole="button"
            accessibilityLabel="Refresh dashboard"
          >
            <Ionicons
              name="refresh-outline"
              size={20}
              color={colors.primary}
              style={{ opacity: refreshing || loading ? 0.45 : 1 }}
            />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>

        {refreshing ? (
          <View style={styles.fetchingStrip} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.fetchingStripText}>Updating dashboard…</Text>
          </View>
        ) : null}

        {!hasMeaningfulData && !error ? (
          <Card style={styles.infoCard}>
            <Text style={styles.infoTitle}>No data available</Text>
            <Text style={styles.infoHint}>Add leads or connect Supabase to see metrics here.</Text>
          </Card>
        ) : null}

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>Showing safe defaults. Check Supabase and API when you can.</Text>
          </Card>
        ) : null}

        <FollowUpOverdueAlert
          followUps={safeTotals.followUpsDue}
          onViewFollowUps={() => navigation.navigate("FollowUps")}
        />

        {hotLeads.length > 0 ? (
          <View style={styles.hotLeadsSection}>
            <Text style={styles.hotLeadsTitle}>Hot leads today 🔥</Text>
            {hotLeads.map((l) => {
              const sc =
                typeof l.lead_score === "number" && Number.isFinite(l.lead_score) ? l.lead_score : 0;
              const city = l.city?.trim() ? l.city.trim() : "—";
              const stage = l.status ? formatLeadStageLabel(l.status) : "—";
              return (
                <Pressable
                  key={l.id}
                  style={({ pressed }) => [styles.hotLeadCard, pressed && styles.hotLeadCardPressed]}
                  onPress={() => navigation.navigate("LeadDetail", { leadId: l.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open lead ${leadDisplayName(l.name)}`}
                >
                  <View style={styles.hotLeadLine}>
                    <Text style={styles.hotLeadEmoji}>{getScoreEmoji(sc)}</Text>
                    <Text style={styles.hotLeadScore}>{sc}</Text>
                    <Text style={styles.hotLeadName} numberOfLines={1}>
                      {leadDisplayName(l.name)}
                    </Text>
                  </View>
                  <Text style={styles.hotLeadSub} numberOfLines={1}>
                    {city} · {stage}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.pipelineValueSection}>
          <Text style={styles.pipelineValueTitle}>PIPELINE VALUE 💰</Text>
          <View style={styles.pipelineValueBox}>
            <View style={styles.pipelineValueRow}>
              <Text style={styles.pipelineValueKey}>New:</Text>
              <Text style={styles.pipelineValueAmt}>{formatPkrEnIn(pvRow.new)}</Text>
            </View>
            <View style={styles.pipelineValueRow}>
              <Text style={styles.pipelineValueKey}>Contacted:</Text>
              <Text style={styles.pipelineValueAmt}>{formatPkrEnIn(pvRow.contacted)}</Text>
            </View>
            <View style={styles.pipelineValueRow}>
              <Text style={styles.pipelineValueKey}>Qualified:</Text>
              <Text style={styles.pipelineValueAmt}>{formatPkrEnIn(pvRow.qualified)}</Text>
            </View>
            <View style={styles.pipelineValueDivider} />
            <View style={styles.pipelineValueRow}>
              <Text style={styles.pipelineValueTotalKey}>Total:</Text>
              <Text style={styles.pipelineValueTotalAmt}>{formatPkrEnIn(pipelineOpenTotal)}</Text>
            </View>
            <Text style={styles.pipelineValueHint}>
              Open pipeline (new + contacted + qualified) · {pipelineDealCurrency}
            </Text>
          </View>
        </View>

        <View style={styles.kpiBlock}>
          <Text style={styles.kpiSectionLabel}>Overview</Text>
          <View style={styles.kpiRow}>
            <KpiCard
              title="Total Leads"
              value={String(safeTotals.totalLeads)}
              icon="people-outline"
              accent={kpi.total.accent}
              bottomAccent={kpi.total.bottom}
              trend={totalLeadsTrend}
              trendSentiment="more_is_good"
            />
            <KpiCard
              title="New Today"
              value={String(safeTotals.leadsToday)}
              icon="sparkles-outline"
              accent={kpi.newToday.accent}
              bottomAccent={kpi.newToday.bottom}
              trend={newTodayTrend}
              trendSentiment="more_is_good"
            />
          </View>
          <View style={styles.kpiRow}>
            <View style={styles.kpiHalf}>
              <KpiCard
                title="Follow-ups Due"
                value={String(safeTotals.followUpsDue)}
                icon="alarm-outline"
                accent={kpi.followUps.accent}
                bottomAccent={kpi.followUps.bottom}
                trend={followUpsTrend}
                trendSentiment="more_is_bad"
              />
            </View>
            <View style={styles.kpiHalf}>
              <KpiCard
                title="Conversion"
                value={conversionValueLabel}
                icon="trending-up-outline"
                accent={kpi.conversion.accent}
                bottomAccent={kpi.conversion.bottom}
                trend={conversionTrend}
                trendSentiment="more_is_good"
              />
              <Text style={styles.kpiConversionHint}>
                Win rate among closed deals: won ÷ (won + lost) × 100. N/A when no leads are won or lost yet.
              </Text>
            </View>
          </View>
          <Text style={styles.kpiHint}>Leads with a scheduled follow-up that is overdue</Text>
        </View>

        <PipelineOverviewSection
          byStatus={byStatus}
          valueByStage={pipelineValueByStage}
          currency={pipelineDealCurrency}
        />

        <LeadSourcesSection bySource={bySource} />

        <Text style={styles.sectionLabel}>Charts</Text>
        <DashboardCharts
          chartData={chartPoints}
          byStatus={byStatus}
          bySource={bySource}
          chartsEnabled={chartsEnabled}
        />

        <DashboardInsights
          data={{
            followUpsDue: safeTotals.followUpsDue,
            conversionRate: rate,
            totalLeads: safeTotals.totalLeads,
            leadsToday: safeTotals.leadsToday,
            newCount: byStatus.new,
            contactedCount: byStatus.contacted,
          }}
        />

        <Card>
          <Text style={styles.cardEyebrow}>Activity</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>AI replies (30d)</Text>
            <Text style={styles.metricValue}>{aiReplies30d ?? 0}</Text>
          </View>
        </Card>

        <Text style={styles.sectionLabel}>Go to</Text>
        <View style={styles.quickGrid}>
          <QuickLink label="Inbox" onPress={() => navigation.navigate("Inbox")} />
          {isManager ? <QuickLink label="Assignment" onPress={() => navigation.navigate("Assignment")} /> : null}
          <QuickLink label="Follow-ups" onPress={() => navigation.navigate("FollowUps")} />
          <QuickLink label="Analytics" onPress={() => navigation.navigate("Analytics")} />
          <QuickLink label="Settings" onPress={() => navigation.navigate("Settings")} />
        </View>
      </ScrollView>
      <AddLeadFab />
    </View>
  );
}

function QuickLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
    >
      <Text style={styles.quickBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  scrollContent: { flexGrow: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  headerTitles: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, marginBottom: 12, fontSize: 15 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 2,
  },
  refreshBtnPressed: { opacity: 0.85 },
  refreshBtnDisabled: { opacity: 0.9 },
  refreshBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  fetchingStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fetchingStripText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  hotLeadsSection: { marginBottom: 16 },
  hotLeadsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },
  hotLeadCard: {
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  hotLeadCardPressed: { opacity: 0.9 },
  hotLeadLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  hotLeadEmoji: { fontSize: 18 },
  hotLeadScore: { color: colors.primary, fontSize: 16, fontWeight: "800", minWidth: 28 },
  hotLeadName: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1, minWidth: 0 },
  hotLeadSub: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  pipelineValueSection: { marginBottom: 20 },
  pipelineValueTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  pipelineValueBox: {
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  pipelineValueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    gap: 12,
  },
  pipelineValueKey: { color: colors.textMuted, fontSize: 15, fontWeight: "600", minWidth: 96 },
  pipelineValueAmt: { color: colors.text, fontSize: 15, fontWeight: "700" },
  pipelineValueDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginVertical: 8,
  },
  pipelineValueTotalKey: { color: colors.text, fontSize: 16, fontWeight: "800" },
  pipelineValueTotalAmt: { color: colors.success, fontSize: 17, fontWeight: "800" },
  pipelineValueHint: { color: colors.textMuted, fontSize: 12, marginTop: 10 },
  infoCard: {
    borderColor: colors.border,
    marginBottom: 12,
    backgroundColor: colors.cardSoft,
  },
  infoTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  infoHint: { color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  kpiBlock: { marginBottom: 4 },
  kpiSectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  kpiHalf: { flex: 1, minWidth: 0 },
  kpiConversionHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  kpiHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  cardEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricLabel: { color: colors.textMuted, fontSize: 15 },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: "45%",
    flexGrow: 1,
  },
  quickBtnPressed: { opacity: 0.9 },
  quickBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15, textAlign: "center" },
  errorCard: { borderColor: colors.warning, marginBottom: 12 },
  errorText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  errorHint: { color: colors.textMuted, marginTop: 6, fontSize: 13 },
});
