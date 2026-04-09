import { StyleSheet, View } from "react-native";
import { Card } from "./Card";
import { ShimmerBox } from "./ShimmerBox";
import { colors } from "../theme/colors";

const AVATAR = 40;

/** Mirrors `PipelineScreen` pipeline card layout for initial load skeletons. */
export function PipelineCardSkeleton() {
  return (
    <View style={styles.cardWrap}>
      <Card style={styles.pipelineCard}>
        <View style={styles.cardBody}>
          <View style={styles.cardNameRow}>
            <ShimmerBox height={AVATAR} width={AVATAR} borderRadius={AVATAR / 2} />
            <View style={styles.nameCol}>
              <ShimmerBox height={14} width="92%" borderRadius={4} />
              <ShimmerBox height={12} width="64%" borderRadius={4} style={styles.nameLine2} />
            </View>
          </View>
          <ShimmerBox height={12} width="55%" borderRadius={4} style={styles.priorityLine} />
          <View style={styles.spinnerSlot} />
        </View>

        <View style={styles.quickStatusRow}>
          <ShimmerBox height={44} borderRadius={8} style={styles.quickBtn} />
          <ShimmerBox height={44} borderRadius={8} style={styles.quickBtn} />
          <ShimmerBox height={44} borderRadius={8} style={styles.quickBtn} />
        </View>

        <View style={styles.cardActions}>
          <View style={styles.actionsRow}>
            <ShimmerBox height={44} borderRadius={12} style={styles.actionHalf} />
            <ShimmerBox height={44} borderRadius={12} style={styles.actionHalf} />
          </View>
          <ShimmerBox height={44} borderRadius={12} style={styles.actionFull} />
          <ShimmerBox height={40} borderRadius={10} style={styles.actionFullMuted} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { marginBottom: 10 },
  pipelineCard: {
    marginBottom: 0,
    minHeight: 260,
    flexDirection: "column",
  },
  cardBody: {
    paddingBottom: 4,
    maxWidth: "100%",
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  nameLine2: {
    marginTop: 0,
  },
  priorityLine: {
    marginTop: 10,
  },
  spinnerSlot: {
    height: 26,
    marginTop: 8,
  },
  quickStatusRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickBtn: {
    flex: 1,
  },
  cardActions: {
    marginTop: "auto",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  actionHalf: {
    flex: 1,
    minWidth: 0,
    flexBasis: "48%",
    maxWidth: "48%",
  },
  actionFull: {
    width: "100%",
  },
  actionFullMuted: {
    width: "100%",
    opacity: 0.85,
  },
});
