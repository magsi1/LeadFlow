import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import {
  buildDashboardInsights,
  type DashboardInsightInput,
  type InsightVariant,
} from "../lib/dashboardInsights";
import { colors } from "../theme/colors";

type Props = {
  data: DashboardInsightInput;
};

const VARIANT: Record<
  InsightVariant,
  { border: string; surface: string; iconWrap: string; iconColor: string }
> = {
  info: {
    border: colors.primary,
    surface: `${colors.primary}16`,
    iconWrap: `${colors.primary}30`,
    iconColor: colors.primary,
  },
  success: {
    border: colors.success,
    surface: `${colors.success}14`,
    iconWrap: `${colors.success}2a`,
    iconColor: colors.success,
  },
  warning: {
    border: colors.warning,
    surface: `${colors.warning}16`,
    iconWrap: `${colors.warning}30`,
    iconColor: colors.warning,
  },
  danger: {
    border: colors.danger,
    surface: `${colors.danger}16`,
    iconWrap: `${colors.danger}2a`,
    iconColor: colors.danger,
  },
};

export function DashboardInsights({ data }: Props) {
  const items = buildDashboardInsights(data);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} accessibilityRole="summary">
      <Text style={styles.sectionLabel}>Insights</Text>
      <Text style={styles.sectionHint}>Today’s signals from your pipeline</Text>
      <View style={styles.stack}>
        {items.map((item) => {
          const v = VARIANT[item.variant];
          return (
            <View
              key={item.id}
              style={[styles.alert, { borderLeftColor: v.border, backgroundColor: v.surface }]}
              accessibilityRole="alert"
              accessibilityLabel={item.text}
            >
              <View style={[styles.iconCircle, { backgroundColor: v.iconWrap }]}>
                <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={v.iconColor} />
              </View>
              <Text style={styles.alertText}>{item.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 4,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 12,
    opacity: 0.9,
  },
  stack: {
    gap: 10,
  },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 12,
    borderRadius: 14,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftWidth: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
});
