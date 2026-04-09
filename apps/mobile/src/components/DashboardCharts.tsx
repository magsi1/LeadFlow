import { useMemo } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { ChartDataPoint } from "../lib/dashboardAnalytics";
import type { DashboardSourceBreakdown, DashboardStatusBreakdown } from "../types/models";
import { colors } from "../theme/colors";
import { Card } from "./Card";

const PIE_COLORS = [
  "rgba(14, 165, 233, 0.92)",
  "rgba(56, 189, 248, 0.95)",
  "rgba(245, 158, 11, 0.95)",
  "rgba(34, 197, 94, 0.92)",
  "rgba(167, 139, 250, 0.95)",
];

type Props = {
  /** Points for the line chart: `label` = day, `value` = lead count. */
  chartData: ChartDataPoint[];
  byStatus: DashboardStatusBreakdown;
  bySource: DashboardSourceBreakdown;
  /** Force-disable chart-kit (e.g. tests). Defaults to disabling on web. */
  chartsEnabled?: boolean;
};

function useChartWidth(): number {
  const { width } = useWindowDimensions();
  return Math.max(260, width - 64);
}

/** Normalize incoming points; returns [] if invalid. */
function normalizeChartData(points: ChartDataPoint[] | null | undefined): ChartDataPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points.map((p) => ({
    date: String((p as any)?.date ?? (p as any)?.label ?? "—"),
    count: typeof (p as any)?.count === "number" && Number.isFinite((p as any)?.count)
      ? (p as any).count
      : typeof (p as any)?.value === "number" && Number.isFinite((p as any)?.value)
        ? (p as any).value
        : 0,
  }));
}

/**
 * Convert `chartData` → LineChart `labels` + `data` (counts).
 * Returns `null` when there is nothing to plot.
 */
function toLineChartShape(points: ChartDataPoint[]): {
  labels: string[];
  data: number[];
} | null {
  if (points.length === 0) return null;
  return {
    labels: points.map((p) => p.date),
    data: points.map((p) => p.count),
  };
}

/** Dark-theme config shared by charts (slate background, cyan stroke). */
function useDarkChartConfig() {
  return useMemo(
    () => ({
      backgroundGradientFrom: colors.card,
      backgroundGradientTo: colors.bg,
      backgroundGradientFromOpacity: 1,
      backgroundGradientToOpacity: 1,
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(14, 165, 233, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
      strokeWidth: 2,
      fillShadowGradientFrom: colors.primary,
      fillShadowGradientOpacity: 0.45,
      fillShadowGradientTo: colors.bg,
      propsForDots: {
        r: "5",
        strokeWidth: "2",
        stroke: "#38bdf8",
      },
      propsForBackgroundLines: {
        strokeDasharray: "6 10",
        stroke: colors.border,
        strokeWidth: 1,
      },
      propsForVerticalLabels: { fontSize: 11 },
      propsForHorizontalLabels: { fontSize: 11 },
      style: { borderRadius: 16 },
    }),
    [],
  );
}

type WebFallbackProps = {
  linePoints: ChartDataPoint[];
  byStatus: DashboardStatusBreakdown;
  bySource: DashboardSourceBreakdown;
};

/** Simple view-based charts (used on web / when chart-kit is disabled). */
function WebChartsFallback({ linePoints, byStatus, bySource }: WebFallbackProps) {
  const sourceRows = Array.isArray(bySource) ? bySource : [];
  const safeLinePoints = Array.isArray(linePoints) ? linePoints : [];
  const maxCount = safeLinePoints.reduce((m, p) => {
    const c = typeof (p as any)?.count === "number" && Number.isFinite((p as any).count) ? (p as any).count : 0;
    return Math.max(m, c);
  }, 0);

  const hasSourceData = sourceRows.some((r) => typeof r.count === "number" && Number.isFinite(r.count) && r.count > 0);
  const hasStatusData =
    [byStatus.new, byStatus.contacted, byStatus.qualified, byStatus.closed].some(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
    );

  return (
    <View style={styles.wrap}>
      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads over last 7 days</Text>
        <Text style={styles.sectionHint}>New leads by day (summary)</Text>

        {safeLinePoints.length === 0 || maxCount <= 0 ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.webBarChart}>
            {safeLinePoints.map((p, i) => {
              const date = String((p as any)?.date ?? (p as any)?.label ?? "—");
              const count = typeof (p as any)?.count === "number" && Number.isFinite((p as any).count) ? (p as any).count : 0;
              const h = maxCount > 0 ? (count / maxCount) * 160 : 0;

              return (
                <View key={`${date}-${i}`} style={styles.webBarCol} accessibilityLabel={`${date}, ${count} leads`}>
                  <View style={styles.webBarTrack}>
                    <View style={[styles.webBarFill, { height: Math.max(2, h) }]} />
                  </View>
                  <Text style={styles.webBarLabel}>{date}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by source</Text>
        {!hasSourceData ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.webList}>
            {sourceRows
              .filter((r) => typeof r.count === "number" && Number.isFinite(r.count) && r.count > 0)
              .map((r) => (
                <View key={r.channel} style={styles.webRow}>
                  <Text style={styles.webLabel}>{r.label}</Text>
                  <Text style={styles.webValue}>{r.count}</Text>
                </View>
              ))}
          </View>
        )}
      </Card>

      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by status</Text>
        {!hasStatusData ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.webList}>
            {(
              [
                ["New", byStatus.new],
                ["Contacted", byStatus.contacted],
                ["Qualified", byStatus.qualified],
                ["Closed", byStatus.closed],
              ] as const
            ).map(([label, n]) => (
              <View key={label} style={styles.webRow}>
                <Text style={styles.webLabel}>{label}</Text>
                <Text style={styles.webValue}>{typeof n === "number" && Number.isFinite(n) ? n : 0}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

export function DashboardCharts({ chartData, byStatus, bySource, chartsEnabled }: Props) {
  const chartWidth = useChartWidth();
  const darkConfig = useDarkChartConfig();
  const isWeb = Platform.OS === "web";
  const shouldUseChartKit = !isWeb && chartsEnabled !== false;

  const linePoints = useMemo(() => normalizeChartData(chartData), [chartData]);

  const lineShape = useMemo(() => toLineChartShape(linePoints), [linePoints]);

  const lineChartPayload = useMemo(() => {
    if (lineShape == null) return null;
    return {
      labels: lineShape.labels,
      datasets: [{ data: lineShape.data }],
    };
  }, [lineShape]);

  const barChartConfig = useMemo(
    () => ({
      ...darkConfig,
      color: (opacity = 1) => `rgba(56, 189, 248, ${opacity})`,
    }),
    [darkConfig],
  );

  const pieChartConfig = useMemo(
    () => ({
      ...darkConfig,
      color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    }),
    [darkConfig],
  );

  const barData = useMemo(
    () => ({
      labels: ["New", "Contact", "Qual.", "Closed"],
      datasets: [
        {
          data: [
            Number.isFinite(byStatus.new) ? byStatus.new : 0,
            Number.isFinite(byStatus.contacted) ? byStatus.contacted : 0,
            Number.isFinite(byStatus.qualified) ? byStatus.qualified : 0,
            Number.isFinite(byStatus.closed) ? byStatus.closed : 0,
          ],
        },
      ],
    }),
    [byStatus],
  );

  const { pieData, sourceTotal } = useMemo(() => {
    const src = Array.isArray(bySource) ? bySource : [];
    const total = src.reduce((s, r) => s + (typeof r.count === "number" && Number.isFinite(r.count) ? r.count : 0), 0);
    const pie = src
      .filter((r) => typeof r.count === "number" && r.count > 0)
      .map((r, i) => ({
        name: r.label.length > 12 ? `${r.label.slice(0, 11)}…` : r.label,
        population: r.count,
        color: PIE_COLORS[i % PIE_COLORS.length]!,
        legendFontColor: colors.textMuted,
        legendFontSize: 11,
      }));
    return { pieData: pie, sourceTotal: total };
  }, [bySource]);

  const sourceHasData = Array.isArray(bySource) && bySource.some((r) => typeof r.count === "number" && Number.isFinite(r.count) && r.count > 0);
  const statusHasData = [byStatus.new, byStatus.contacted, byStatus.qualified, byStatus.closed].some(
    (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
  );

  if (!shouldUseChartKit) {
    return <WebChartsFallback linePoints={linePoints} byStatus={byStatus} bySource={bySource} />;
  }

  // Load chart-kit dynamically so web bundlers never try to import it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chartKit = require("react-native-chart-kit") as any;
  const LineChart = chartKit.LineChart as any;
  const PieChart = chartKit.PieChart as any;
  const BarChart = chartKit.BarChart as any;

  return (
    <View style={styles.wrap}>
      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads over last 7 days</Text>
        <Text style={styles.sectionHint}>New leads by calendar day</Text>
        {lineChartPayload == null ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <LineChart
            data={lineChartPayload}
            width={chartWidth}
            height={220}
            chartConfig={darkConfig}
            bezier={linePoints.length >= 2}
            fromZero
            withInnerLines
            segments={4}
            style={styles.lineChart}
          />
        )}
      </Card>

      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by source</Text>
        {!sourceHasData || pieData.length === 0 || sourceTotal === 0 ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <PieChart
            data={pieData}
            width={chartWidth}
            height={220}
            chartConfig={pieChartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="8"
            absolute
            hasLegend
            avoidFalseZero
            style={styles.chartPad}
          />
        )}
      </Card>

      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by status</Text>
        <Text style={styles.sectionHint}>Qualified includes proposal sent · Closed = won + lost</Text>
        {!statusHasData ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <BarChart
            data={barData}
            width={chartWidth}
            height={240}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={barChartConfig}
            fromZero
            showValuesOnTopOfBars
            withVerticalLabels
            style={styles.chartPad}
          />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  chartCard: {
    marginBottom: 14,
    overflow: "hidden",
    paddingVertical: 2,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  lineChart: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    alignSelf: "center",
  },
  chartPad: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    alignSelf: "center",
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 28,
    textAlign: "center",
    lineHeight: 22,
  },
  webList: {
    gap: 0,
    marginTop: 4,
  },
  webBarChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 190,
    paddingHorizontal: 6,
    marginTop: 6,
  },
  webBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    marginHorizontal: 2,
  },
  webBarTrack: {
    width: "100%",
    height: 160,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: colors.cardSoft,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  webBarFill: {
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 6,
    alignSelf: "flex-end",
  },
  webBarLabel: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: "center",
    maxWidth: 56,
  },
  webRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  webLabel: { color: colors.textMuted, fontSize: 14 },
  webValue: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
