import { Ionicons } from "@expo/vector-icons";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme/colors";

export type KpiTrend = "up" | "down" | "neutral";

/** Whether a higher metric value is desirable (colors the arrow). */
export type KpiTrendSentiment = "more_is_good" | "more_is_bad";

type Props = {
  title: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  /** Icon tint and main value color */
  accent: string;
  /** Thin bottom border color (semantic: info / good / warning / danger) */
  bottomAccent: string;
  trend?: KpiTrend;
  trendSentiment?: KpiTrendSentiment;
  style?: StyleProp<ViewStyle>;
};

function trendArrowColor(trend: KpiTrend, sentiment: KpiTrendSentiment | undefined): string {
  if (trend === "neutral" || !sentiment) return colors.textMuted;
  if (sentiment === "more_is_good") {
    return trend === "up" ? colors.success : trend === "down" ? colors.danger : colors.textMuted;
  }
  // more_is_bad: up is worse (warning), down is better (success)
  return trend === "up" ? colors.warning : trend === "down" ? colors.success : colors.textMuted;
}

export function KpiCard({
  title,
  value,
  icon,
  accent,
  bottomAccent,
  trend = "neutral",
  trendSentiment,
  style,
}: Props) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const arrowColor = trendArrowColor(trend, trendSentiment);

  return (
    <Pressable
      accessibilityLabel={`${title}: ${value}`}
      style={(state) => {
        const hovered = Platform.OS === "web" && "hovered" in state && Boolean(state.hovered);
        const pressed = state.pressed;
        return [
          styles.card,
          {
            borderBottomColor: bottomAccent,
            shadowColor: bottomAccent,
          },
          hovered && styles.cardHovered,
          pressed && styles.cardPressed,
          style,
        ];
      }}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <View style={[styles.iconBadge, { backgroundColor: `${accent}26` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
      </View>
      <View style={styles.valueRow}>
        <Text
          style={[styles.value, { color: accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {value}
        </Text>
        {arrow ? (
          <Text style={[styles.trendArrow, { color: arrowColor }]} accessibilityElementsHidden>
            {arrow}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 118,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 3,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  cardHovered: {
    opacity: 0.97,
    transform: [{ translateY: -1 }],
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    flexWrap: "nowrap",
    gap: 6,
  },
  value: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.8,
    flexShrink: 1,
  },
  trendArrow: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 34,
    marginBottom: 2,
  },
});
