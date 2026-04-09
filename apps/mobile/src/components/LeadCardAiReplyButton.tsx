import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  onPress: () => void;
  disabled?: boolean;
};

/** Same control as Pipeline cards: sparkles + “AI reply”, full width. */
export function LeadCardAiReplyButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionsFull,
        styles.aiLinkBtn,
        pressed && styles.actionBtnPressed,
        disabled && styles.actionBtnMuted,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="AI reply"
    >
      <Ionicons name="sparkles-outline" size={16} color={colors.textMuted} />
      <Text style={styles.aiLinkText}>AI reply</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionsFull: {
    flexBasis: "100%",
    width: "100%",
  },
  aiLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    minHeight: 44,
  },
  aiLinkText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  actionBtnMuted: { opacity: 0.85 },
  actionBtnPressed: { opacity: 0.88 },
});
