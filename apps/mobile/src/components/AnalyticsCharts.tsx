import { useMemo } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { DashboardPriorityBreakdown, DashboardStatusBreakdown } from "../types/models";
import { colors } from "../theme/colors";
import { Card } from "./Card";

/** Theme-aligned RGBA for react-native-chart-kit (pie segments). */
const C = {
  primary: "rgba(14, 165, 233, 0.95)",
  success: "rgba(34, 197, 94, 0.95)",
  warning: "rgba(245, 158, 11, 0.95)",
  danger: "rgba(239, 68, 68, 0.95)",
} as const;

type Props = {
  byStatus: DashboardStatusBreakdown;
  byPriority: DashboardPriorityBreakdown;
};

function useChartWidth(): number {
  const { width } = useWindowDimensions();
  return Math.max(260, Math.min(width - 48, 360));
}

function statusPieSlices(byStatus: DashboardStatusBreakdown) {
  const rows: { name: string; population: number; color: string }[] = [
    { name: "New", population: byStatus.new, color: C.primary },
    { name: "Contacted", population: byStatus.contacted, color: C.warning },
    { name: "Qualified", population: byStatus.qualified, color: C.success },
    { name: "Closed", population: byStatus.closed, color: C.danger },
  ];
  return rows
    .filter((r) => typeof r.population === "number" && Number.isFinite(r.population) && r.population > 0)
    .map((r) => ({
      name: r.name,
      population: r.population,
      color: r.color,
      legendFontColor: colors.textMuted,
      legendFontSize: 12,
    }));
}

function priorityBarRows(byPriority: DashboardPriorityBreakdown) {
  return [
    { label: "High", value: byPriority.high, fill: colors.danger },
    { label: "Medium", value: byPriority.medium, fill: colors.warning },
    { label: "Low", value: byPriority.low, fill: colors.success },
  ];
}

function AnalyticsChartsWeb({ byStatus, byPriority }: Props) {
  const statusTotal =
    byStatus.new + byStatus.contacted + byStatus.qualified + byStatus.closed;
  const priRows = priorityBarRows(byPriority);
  const maxPri = Math.max(1, ...priRows.map((r) => r.value));

  return (
    <View style={styles.wrap}>
      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by status</Text>
        <Text style={styles.sectionHint}>New · Contacted · Qualified · Closed (won + lost)</Text>
        {statusTotal <= 0 ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.webDonut}>
            {(
              [
                ["New", byStatus.new, C.primary],
                ["Contacted", byStatus.contacted, C.warning],
                ["Qualified", byStatus.qualified, C.success],
                ["Closed", byStatus.closed, C.danger],
              ] as const
            ).map(([label, n, fill]) => {
              const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
              const pct = statusTotal > 0 ? Math.round((v / statusTotal) * 100) : 0;
              if (v <= 0) return null;
              return (
                <View key={String(label)} style={styles.webLegendRow}>
                  <View style={[styles.webSwatch, { backgroundColor: fill as string }]} />
                  <Text style={styles.webLabel}>{label}</Text>
                  <Text style={styles.webValue}>
                    {v} ({pct}%)
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by priority</Text>
        <Text style={styles.sectionHint}>High · Medium · Low</Text>
        {!priRows.some((r) => r.value > 0) ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.hBarList}>
            {priRows.map((row) => {
              const w = maxPri > 0 ? Math.max(4, (row.value / maxPri) * 100) : 0;
              return (
                <View key={row.label} style={styles.hBarRow}>
                  <View style={styles.hBarLabelRow}>
                    <Text style={styles.hBarLabel}>{row.label}</Text>
                    <Text style={styles.hBarValue}>{row.value}</Text>
                  </View>
                  <View style={styles.hBarTrack}>
                    <View style={[styles.hBarFill, { width: `${w}%`, backgroundColor: row.fill }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </View>
  );
}

export function AnalyticsCharts({ byStatus, byPriority }: Props) {
  const chartWidth = useChartWidth();
  const pieData = useMemo(() => statusPieSlices(byStatus), [byStatus]);
  const statusTotal = pieData.reduce((s, p) => s + p.population, 0);
  const priRows = useMemo(() => priorityBarRows(byPriority), [byPriority]);
  const maxPri = Math.max(1, ...priRows.map((r) => r.value));
  const hasPriorityData = priRows.some((r) => r.value > 0);

  const pieChartConfig = useMemo(
    () => ({
      backgroundGradientFrom: colors.card,
      backgroundGradientTo: colors.bg,
      backgroundGradientFromOpacity: 1,
      backgroundGradientToOpacity: 1,
      color: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
      labelColor: () => colors.textMuted,
    }),
    [],
  );

  const isWeb = Platform.OS === "web";
  if (isWeb) {
    return <AnalyticsChartsWeb byStatus={byStatus} byPriority={byPriority} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chartKit = require("react-native-chart-kit") as any;
  const PieChart = chartKit.PieChart as any;

  return (
    <View style={styles.wrap}>
      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Leads by status</Text>
        <Text style={styles.sectionHint}>New · Contacted · Qualified · Closed (won + lost)</Text>
        {statusTotal <= 0 || pieData.length === 0 ? (
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
        <Text style={styles.sectionTitle}>Leads by priority</Text>
        <Text style={styles.sectionHint}>High · Medium · Low</Text>
        {!hasPriorityData ? (
          <Text style={styles.empty}>No chart data</Text>
        ) : (
          <View style={styles.hBarList}>
            {priRows.map((row) => {
              const w = maxPri > 0 ? Math.max(4, (row.value / maxPri) * 100) : 0;
              return (
                <View key={row.label} style={styles.hBarRow}>
                  <View style={styles.hBarLabelRow}>
                    <Text style={styles.hBarLabel}>{row.label}</Text>
                    <Text style={styles.hBarValue}>{row.value}</Text>
                  </View>
                  <View style={styles.hBarTrack}>
                    <View style={[styles.hBarFill, { width: `${w}%`, backgroundColor: row.fill }]} />
                  </View>
                </View>
              );
            })}
          </View>
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
  chartPad: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 16,
    alignSelf: "center",
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  hBarList: { gap: 14, marginTop: 4 },
  hBarRow: { gap: 6 },
  hBarLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hBarLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  hBarValue: { color: colors.text, fontSize: 15, fontWeight: "800" },
  hBarTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: colors.cardSoft,
    overflow: "hidden",
  },
  hBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  webDonut: { gap: 0, marginTop: 4 },
  webLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  webSwatch: { width: 12, height: 12, borderRadius: 6 },
  webLabel: { flex: 1, color: colors.textMuted, fontSize: 14 },
  webValue: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
