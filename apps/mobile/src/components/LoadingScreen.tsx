import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  message?: string;
};

export function LoadingScreen({ message = "Loading…" }: Props) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: 24,
  },
  text: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 15,
  },
});
