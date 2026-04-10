import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ShimmerBox } from "./ShimmerBox";
import { colors } from "../theme/colors";
import { SCREEN_PADDING_H } from "../theme/tokens";

export function DashboardSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: 88 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <ShimmerBox height={22} width="55%" borderRadius={6} />
      <ShimmerBox height={14} width="40%" borderRadius={4} style={styles.gapSm} />
      <View style={styles.row}>
        <ShimmerBox height={100} style={styles.kpi} borderRadius={12} />
        <ShimmerBox height={100} style={styles.kpi} borderRadius={12} />
      </View>
      <ShimmerBox height={120} borderRadius={12} style={styles.block} />
      <ShimmerBox height={160} borderRadius={12} style={styles.block} />
      <ShimmerBox height={80} borderRadius={12} style={styles.block} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: SCREEN_PADDING_H,
    paddingTop: 8,
    gap: 12,
  },
  gapSm: { marginTop: 10 },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  kpi: { flex: 1, minWidth: 0 },
  block: { marginTop: 4 },
});
