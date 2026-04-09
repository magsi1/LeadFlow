import { StyleSheet, Text, View } from "react-native";
import { buildLeadSourceAnalytics } from "../lib/sourceAnalytics";
import type { DashboardSourceBreakdown } from "../types/models";
import { colors } from "../theme/colors";
import { Card } from "./Card";

const BAR_COLORS: Record<string, string> = {
  whatsapp: "#22c55e",
  instagram: "#e11d48",
  facebook: "#3b82f6",
  manual: "#94a3b8",
  other: "#a78bfa",
};

/** Show only the four primary channels in the main list; “Other” is appended when present. */
const PRIMARY = new Set(["whatsapp", "instagram", "facebook", "manual"]);

function formatPct(p: number): string {
  if (p % 1 === 0) return `${Math.round(p)}%`;
  return `${p.toFixed(1)}%`;
}

type Props = {
  /** From dashboard analytics: counts per `source_channel` (Supabase / API). */
  bySource: DashboardSourceBreakdown;
};

export function LeadSourcesSection({ bySource }: Props) {
  const rows = buildLeadSourceAnalytics(bySource);
  const primaryRows = rows.filter((r) => PRIMARY.has(r.channel));
  const otherRow = rows.find((r) => r.channel === "other");
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Lead Sources</Text>
      <Card style={styles.card}>
        <Text style={styles.cardHint}>
          Grouped by channel · {total > 0 ? `${total} total` : "No leads yet"}
        </Text>

        {total === 0 ? (
          <Text style={styles.empty}>Leads will appear here with source, count, and share of your pipeline.</Text>
        ) : (
          <View style={styles.list}>
            {primaryRows.map((row) => {
              const barColor = BAR_COLORS[row.channel] ?? colors.primary;
              const w = Math.min(100, Math.max(0, row.percentage));
              return (
                <View
                  key={row.channel}
                  style={styles.row}
                  accessibilityLabel={`${row.label}, ${row.count} leads, ${formatPct(row.percentage)}`}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.sourceName}>{row.label}</Text>
                    <Text style={styles.metaRight}>
                      <Text style={styles.pct}>{formatPct(row.percentage)}</Text>
                      <Text style={styles.metaSep}> · </Text>
                      <Text style={styles.count}>{row.count}</Text>
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${w}%`, backgroundColor: barColor }]} />
                  </View>
                </View>
              );
            })}

            {otherRow ? (
              <View
                style={[styles.row, styles.rowOther]}
                accessibilityLabel={`${otherRow.label}, ${otherRow.count} leads, ${formatPct(otherRow.percentage)}`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.sourceName}>{otherRow.label}</Text>
                  <Text style={styles.metaRight}>
                    <Text style={styles.pct}>{formatPct(otherRow.percentage)}</Text>
                    <Text style={styles.metaSep}> · </Text>
                    <Text style={styles.count}>{otherRow.count}</Text>
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(100, Math.max(0, otherRow.percentage))}%`,
                        backgroundColor: BAR_COLORS.other,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
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
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  card: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 2,
  },
  cardHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
  list: { gap: 18 },
  row: { gap: 8 },
  rowOther: {
    marginTop: 4,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
  },
  sourceName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    flex: 1,
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 0,
  },
  pct: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  metaSep: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  count: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.cardSoft,
    overflow: "hidden",
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
});
