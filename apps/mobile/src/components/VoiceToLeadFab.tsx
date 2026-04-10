import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

const VIOLET = "#7c3aed";

type Props = {
  bottomExtra?: number;
  onPress: () => void;
};

/** Purple mic FAB — sits to the left of the green Add Lead FAB. */
export function VoiceToLeadFab({ bottomExtra = 0, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: tabBarHeight + insets.bottom + 12 + bottomExtra,
          right: 16 + insets.right + 56 + 12,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Voice to lead — record a voice note"
      >
        <Ionicons name="mic" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 20,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: VIOLET,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  fabPressed: { opacity: 0.92 },
});
