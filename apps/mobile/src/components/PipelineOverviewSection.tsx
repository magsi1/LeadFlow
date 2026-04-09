import { StyleSheet, Text, View } from "react-native";
import { formatDealCurrencyAmount } from "../lib/dealValue";
import type { DashboardPipelineValueByStage, DashboardStatusBreakdown } from "../types/models";
import { colors } from "../theme/colors";
import { Card } from "./Card";

type Props = {
  byStatus: DashboardStatusBreakdown;
  /** Optional: total open pipeline value per stage (same buckets as counts). */
  valueByStage?: DashboardPipelineValueByStage | null;
  currency?: string | null;
};

const STAGES: {
  key: keyof DashboardStatusBreakdown;
  label: string;
  barColor: string;
}[] = [
    { key: "new", label: "New leads", barColor: "#0ea5e9" },
    { key: "contacted", label: "Contacted", barColor: "#38bdf8" },
    { key: "qualified", label: "Qualified", barColor: "#f59e0b" },
    { key: "closed", label: "Closed", barColor: "#22c55e" },
  ];

function safeCount(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function PipelineOverviewSection({ byStatus, valueByStage, currency }: Props) {
  const counts = STAGES.map((s) => safeCount(byStatus[s.key]));
  const total = counts.reduce((a, b) => a + b, 0);
  const cur = (currency ?? "PKR").trim() || "PKR";
  const values = valueByStage
    ? STAGES.map((s) => {
      const v = valueByStage[s.key];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    })
    : null;
  const totalValue = values ? values.reduce((a, b) => a + b, 0) : 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Pipeline Overview</Text>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>By stage</Text>
        <Text style={styles.cardHint}>
          {total > 0 ? `${total} lead${total === 1 ? "" : "s"} in pipeline` : "Counts by lead status"}
        </Text>
        {values && totalValue > 0 ? (
          <Text style={styles.totalValueLine}>
            Total pipeline value: {formatDealCurrencyAmount(totalValue, cur)}
          </Text>
        ) : null}

        {total === 0 ? (
          <Text style={styles.empty}>No pipeline data yet — leads will appear here by stage.</Text>
        ) : (
          <View style={styles.list}>
            {STAGES.map((stage, i) => {
              const count = counts[i];
              const pct = total > 0 ? (count / total) * 100 : 0;
              const w = Math.min(100, Math.max(0, pct));
              return (
                <View
                  key={stage.key}
                  style={styles.row}
                  accessibilityLabel={`${stage.label}, ${count}`}
                >
                  <View style={styles.rowHeader}>
                    <Text style={styles.stageName}>{stage.label}</Text>
                    <View style={styles.countCol}>
                      <Text style={styles.count}>{count}</Text>
                      {values ? (
                        <Text style={styles.stageValue}>
                          {formatDealCurrencyAmount(values[i] ?? 0, cur)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${w}%`, backgroundColor: stage.barColor }]} />
                  </View>
                  <Text style={styles.pctMeta}>
                    {pct % 1 === 0 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`} of pipeline
                  </Text>
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
  wrap: { marginBottom: 4 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingVertical: 14,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
  },
  totalValueLine: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "700",
    marginTop: -8,
    marginBottom: 10,
  },
  list: { gap: 16 },
  row: { gap: 6 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  stageName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
  },
  countCol: { alignItems: "flex-end", gap: 2 },
  count: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  stageValue: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardSoft,
    overflow: "hidden",
  },
  fill: {
    height: 8,
    borderRadius: 4,
  },
  pctMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: 20,
  },
});
