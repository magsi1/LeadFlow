import { StyleSheet, Text, View } from "react-native";
import { avatarBackgroundFromName, leadInitialsFromName } from "../lib/leadAvatar";

type Props = {
  name: string | null | undefined;
  /** Default 40 (Pipeline cards). Inbox uses 44. */
  size?: number;
};

const DEFAULT_SIZE = 40;

export function LeadAvatar({ name, size = DEFAULT_SIZE }: Props) {
  const fontSize = Math.max(11, Math.round(size * 0.36));
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: avatarBackgroundFromName(name),
        },
      ]}
    >
      <Text
        style={[styles.initials, { fontSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {leadInitialsFromName(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
