import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { formatDealCurrencyAmount } from "../lib/dealValue";
import type { MonthlyDealValueSeries } from "../lib/dealValueAnalytics";
import { colors } from "../theme/colors";

type Props = {
  series: MonthlyDealValueSeries;
  currency: string;
};

export function RevenueByMonthCard({ series, currency }: Props) {
  const cur = (currency || "PKR").trim() || "PKR";
  const max = Math.max(1, ...series.amounts.map((a) => (typeof a === "number" && Number.isFinite(a) ? a : 0)));
  const hasData = series.amounts.some((a) => a > 0);

  return (
    <Card style={styles.chartCard}>
      <Text style={styles.sectionTitle}>Won deal value by month</Text>
      <Text style={styles.sectionHint}>Sum of deal value for leads marked won (last 12 months, your timezone)</Text>
      {!hasData ? (
        <Text style={styles.empty}>No won deal value in this period</Text>
      ) : (
        <View style={styles.hBarList}>
          {series.labels.map((label, i) => {
            const raw = series.amounts[i];
            const amount = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
            const w = max > 0 ? Math.max(4, (amount / max) * 100) : 0;
            return (
              <View key={`${label}-${i}`} style={styles.hBarRow}>
                <View style={styles.hBarLabelRow}>
                  <Text style={styles.hBarLabel}>{label}</Text>
                  <Text style={styles.hBarValue}>{formatDealCurrencyAmount(amount, cur)}</Text>
                </View>
                <View style={styles.hBarTrack}>
                  <View style={[styles.hBarFill, { width: `${w}%`, backgroundColor: colors.success }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
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
  hBarLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600", flex: 1, paddingRight: 8 },
  hBarValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
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
});
