import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  /** Follow-ups due (same as dashboard: `next_follow_up_at` set and ≤ now). */
  followUps: number;
  /** Navigate to the Follow-ups tab (`FollowUps` → `FollowUpsScreen`). */
  onViewFollowUps: () => void;
};

export function FollowUpOverdueAlert({ followUps, onViewFollowUps }: Props) {
  if (followUps <= 0) {
    return null;
  }

  const noun = followUps === 1 ? "overdue follow-up" : "overdue follow-ups";

  return (
    <View
      style={styles.wrap}
      accessibilityRole="alert"
      accessibilityLabel={`You have ${followUps} ${noun}. View Follow-ups.`}
    >
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle" size={24} color={colors.danger} />
          </View>
          <Text style={styles.message}>
            You have <Text style={styles.messageEmphasis}>{followUps}</Text> {noun}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onViewFollowUps}
          accessibilityRole="button"
          accessibilityLabel="View Follow-ups"
        >
          <Text style={styles.buttonText}>View Follow-ups</Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const cardShadow =
  Platform.OS === "ios"
    ? {
      shadowColor: "#ef4444",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
    }
    : Platform.OS === "android"
      ? { elevation: 8 }
      : {
        boxShadow: "0 4px 14px rgba(239, 68, 68, 0.45)",
      };

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  card: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    padding: 14,
    gap: 14,
    ...cardShadow,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  messageEmphasis: {
    color: colors.danger,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "stretch",
    backgroundColor: colors.danger,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
