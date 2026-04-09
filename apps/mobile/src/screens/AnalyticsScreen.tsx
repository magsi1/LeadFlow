import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnalyticsCharts } from "../components/AnalyticsCharts";
import { Card } from "../components/Card";
import { LeadSourcesSection } from "../components/LeadSourcesSection";
import { LoadingScreen } from "../components/LoadingScreen";
import { RevenueByMonthCard } from "../components/RevenueByMonthCard";
import { formatPkrEnIn } from "../lib/dealValue";
import { emptyDashboardAnalytics, loadDashboardAnalytics } from "../lib/dashboardAnalytics";
import {
  fetchDealKpisAnalytics,
  fetchMonthlyWonDealValue,
  type DealKpis,
  type MonthlyDealValueSeries,
} from "../lib/dealValueAnalytics";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { api } from "../services/api";
import { countMyAiRepliesInLastDays } from "../services/leadAiRepliesRepository";
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { colors } from "../theme/colors";

const emptyDashboard = emptyDashboardAnalytics();

export function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const analytics = useAppStore((s) => s.analytics);
  const setAnalytics = useAppStore((s) => s.setAnalytics);
  const leadsDataRevision = useAppStore((s) => s.leadsDataRevision);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiReplies30d, setAiReplies30d] = useState<number | null>(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyDealValueSeries>({ labels: [], amounts: [] });
  const [dealKpis, setDealKpis] = useState<DealKpis | null>(null);
  const appTimeZone = useAppPreferencesStore((s) => s.timeZone);

  const load = useCallback(async () => {
    const { dashboard, apiError } = await loadDashboardAnalytics({
      demoMode: api.demoMode,
      supabaseConfigured: isSupabaseConfigured(),
      getApiDashboard: () => api.getAnalyticsDashboard(),
    });
    setAnalytics(dashboard);
    setError(apiError);
    if (isSupabaseConfigured()) {
      try {
        const n = await countMyAiRepliesInLastDays(30);
        setAiReplies30d(n);
      } catch {
        setAiReplies30d(null);
      }
      try {
        const tz = typeof appTimeZone === "string" && appTimeZone.trim() ? appTimeZone.trim() : "UTC";
        const series = await fetchMonthlyWonDealValue(tz);
        setMonthlyRevenue(series);
      } catch {
        setMonthlyRevenue({ labels: [], amounts: [] });
      }
      try {
        const kpis = await fetchDealKpisAnalytics();
        setDealKpis(kpis);
      } catch {
        setDealKpis(null);
      }
    } else {
      setAiReplies30d(null);
      setMonthlyRevenue({ labels: [], amounts: [] });
      setDealKpis(null);
    }
  }, [setAnalytics, appTimeZone]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        if (active) {
          const message = e instanceof Error ? e.message : "Could not load analytics.";
          setError(message);
          setAnalytics(emptyDashboard);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load, setAnalytics]);

  useEffect(() => {
    if (leadsDataRevision === 0) return;
    void (async () => {
      try {
        await load();
      } catch (e) {
        if (__DEV__) console.error("[Analytics] leadsDataRevision refetch:", e);
      }
    })();
  }, [leadsDataRevision, load]);

  const retry = useCallback(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await load();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load analytics.";
        setError(message);
        setAnalytics(emptyDashboard);
      } finally {
        setLoading(false);
      }
    })();
  }, [load, setAnalytics]);

  if (loading && !analytics) {
    return <LoadingScreen message="Loading analytics…" />;
  }

  const totals = analytics?.totals ?? emptyDashboard.totals;
  const byStatus = analytics?.byStatus ?? emptyDashboard.byStatus;
  const byPriority = analytics?.byPriority ?? emptyDashboard.byPriority;
  const bySource = analytics?.bySource?.length ? analytics.bySource : emptyDashboard.bySource;
  const rawRate = analytics?.conversionRate;
  const rate: number | null =
    rawRate === null || rawRate === undefined
      ? null
      : typeof rawRate === "number" && Number.isFinite(rawRate)
        ? rawRate
        : null;
  const conversionDisplay = rate === null ? "N/A" : `${rate.toFixed(1)}%`;
  const safeTotals = {
    totalLeads: typeof totals?.totalLeads === "number" && Number.isFinite(totals.totalLeads) ? totals.totalLeads : 0,
    leadsToday: typeof totals?.leadsToday === "number" && Number.isFinite(totals.leadsToday) ? totals.leadsToday : 0,
    highPriorityLeads:
      typeof totals?.highPriorityLeads === "number" && Number.isFinite(totals.highPriorityLeads)
        ? totals.highPriorityLeads
        : 0,
    wonLeads: typeof totals?.wonLeads === "number" && Number.isFinite(totals.wonLeads) ? totals.wonLeads : 0,
    followUpsDue:
      typeof totals?.followUpsDue === "number" && Number.isFinite(totals.followUpsDue) ? totals.followUpsDue : 0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Analytics</Text>
      <Text style={styles.subtitle}>Pipeline overview</Text>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Showing zeros until data loads.</Text>
          <Pressable style={styles.retryBtn} onPress={retry} accessibilityRole="button">
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}

      <AnalyticsCharts byStatus={byStatus} byPriority={byPriority} />

      {dealKpis != null && isSupabaseConfigured() ? (
        <Card>
          <Text style={styles.cardEyebrow}>Deal value</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Total pipeline value</Text>
            <Text style={styles.metricMoney}>{formatPkrEnIn(dealKpis.openPipelineTotal)}</Text>
          </View>
          <Text style={styles.metricSubHint}>Open pipeline: new + contacted + qualified</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Won revenue total</Text>
            <Text style={styles.metricMoney}>{formatPkrEnIn(dealKpis.wonRevenueTotal)}</Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Average deal size (won)</Text>
            <Text style={styles.metricMoney}>
              {dealKpis.avgWonDealSize != null ? formatPkrEnIn(dealKpis.avgWonDealSize) : "—"}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Biggest deal</Text>
            <Text style={styles.metricMoney}>{formatPkrEnIn(dealKpis.biggestDeal)}</Text>
          </View>
        </Card>
      ) : null}

      {isSupabaseConfigured() ? <RevenueByMonthCard series={monthlyRevenue} currency="PKR" /> : null}

      <Card>
        <Text style={styles.cardEyebrow}>AI assistant</Text>
        <Metric
          label="AI replies saved (30 days)"
          value={aiReplies30d ?? 0}
          accent
          hint={aiReplies30d === null && !api.demoMode ? "Supabase or migration missing" : undefined}
        />
        <Text style={styles.aiHint}>
          Replies are stored when you tap Generate Reply on a lead. Open a lead from Inbox to add more.
        </Text>
      </Card>

      <Card>
        <Metric label="Total leads" value={safeTotals.totalLeads} />
        <Metric label="New leads today" value={safeTotals.leadsToday} />
        <Metric label="High priority leads" value={safeTotals.highPriorityLeads} accent />
        <Metric label="Won leads" value={safeTotals.wonLeads} />
        <Metric
          label="Follow-ups due"
          value={safeTotals.followUpsDue}
          hint="Leads with a follow-up scheduled before now"
          hintMuted
        />
        <View style={styles.divider} />
        <Text style={styles.rateLabel}>Conversion (win rate among closed)</Text>
        <Text style={[styles.rateValue, rate === null && styles.rateValueNa]}>{conversionDisplay}</Text>
        <Text style={styles.rateFormula}>
          won ÷ (won + lost) × 100 — N/A until at least one lead is won or lost.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardEyebrow}>By status</Text>
        <Metric label="New" value={byStatus.new} />
        <Metric label="Contacted" value={byStatus.contacted} />
        <Metric label="Qualified" value={byStatus.qualified} hint="includes proposal sent" />
        <Metric label="Closed (won + lost)" value={byStatus.closed} />
      </Card>

      <LeadSourcesSection bySource={bySource} />
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  accent,
  hint,
  hintMuted,
}: {
  label: string;
  value: number;
  accent?: boolean;
  hint?: string;
  /** Use small muted text (e.g. explanatory subtitle) instead of accent warning tone. */
  hintMuted?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabelCol}>
        <Text style={styles.metricLabel}>{label}</Text>
        {hint ? (
          <Text style={hintMuted ? styles.metricHintMuted : styles.metricHint}>{hint}</Text>
        ) : null}
      </View>
      <Text style={[styles.metricValue, accent && styles.metricAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, marginBottom: 16, fontSize: 15 },
  cardEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  aiHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 12 },
  errorCard: { borderColor: colors.warning },
  errorText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  errorHint: { color: colors.textMuted, marginTop: 6, fontSize: 13 },
  retryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  retryLabel: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricLabelCol: { flex: 1, paddingRight: 12 },
  metricLabel: { color: colors.textMuted, fontSize: 15 },
  metricHint: { color: colors.warning, fontSize: 11, marginTop: 4 },
  metricHintMuted: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  metricMoney: { color: colors.success, fontSize: 16, fontWeight: "800" },
  metricSubHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metricAccent: { color: colors.primary },
  divider: { height: 16 },
  rateLabel: { color: colors.textMuted, fontSize: 14, marginBottom: 4 },
  rateValue: { color: colors.success, fontSize: 28, fontWeight: "800" },
  rateValueNa: { color: colors.textMuted, fontWeight: "700" },
  rateFormula: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
});
