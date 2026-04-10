import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { ShimmerBox } from "./ShimmerBox";
import { colors } from "../theme/colors";
import { SCREEN_PADDING_H } from "../theme/tokens";

export function FollowUpsSkeleton() {
  return (
    <View style={styles.page}>
      <ShimmerBox height={26} width="48%" borderRadius={6} />
      <ShimmerBox height={14} width="72%" borderRadius={4} style={styles.sub} />
      {[0, 1, 2].map((i) => (
        <Card key={i} style={styles.card}>
          <View style={styles.row}>
            <ShimmerBox height={44} width={44} borderRadius={22} />
            <View style={styles.col}>
              <ShimmerBox height={16} width="88%" borderRadius={4} />
              <ShimmerBox height={13} width="55%" borderRadius={4} style={styles.line2} />
            </View>
          </View>
          <View style={styles.actions}>
            <ShimmerBox height={40} borderRadius={10} style={styles.half} />
            <ShimmerBox height={40} borderRadius={10} style={styles.half} />
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: SCREEN_PADDING_H,
    paddingTop: 8,
  },
  sub: { marginTop: 10, marginBottom: 18 },
  card: { marginBottom: 12, paddingVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  col: { flex: 1, minWidth: 0, gap: 8 },
  line2: { marginTop: 0 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  half: { flex: 1 },
});
