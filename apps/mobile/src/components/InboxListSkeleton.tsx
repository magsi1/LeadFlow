import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { ShimmerBox } from "./ShimmerBox";
export function InboxListSkeleton() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} style={styles.card}>
          <View style={styles.row}>
            <ShimmerBox height={44} width={44} borderRadius={22} />
            <View style={styles.col}>
              <ShimmerBox height={16} width="85%" borderRadius={4} />
              <ShimmerBox height={12} width="50%" borderRadius={4} style={styles.gap} />
              <ShimmerBox height={12} width="100%" borderRadius={4} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  card: { paddingVertical: 12 },
  row: { flexDirection: "row", gap: 12 },
  col: { flex: 1, minWidth: 0, gap: 8 },
  gap: { marginTop: 0 },
});
