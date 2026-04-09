import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

type Props = {
  /** Extra bottom padding so FAB clears scroll content (e.g. horizontal pipeline). */
  bottomExtra?: number;
};

/**
 * Floating “add lead” control for tab screens. Registers against the root stack’s `AddLead` route.
 */
export function AddLeadFab({ bottomExtra = 0 }: Props) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const open = () => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("AddLead" as never);
    } else {
      (navigation as NavigationProp<ParamListBase>).navigate("AddLead" as never);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: tabBarHeight + insets.bottom + 12 + bottomExtra,
          right: 16 + insets.right,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Add lead"
      >
        <Ionicons name="add" size={30} color={colors.text} />
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
    backgroundColor: colors.primary,
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
