import { useEffect, useRef, useState } from "react";
import {
  Animated,
  type DimensionValue,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme/colors";

type Props = {
  height: number;
  /** Omit to let `style` (e.g. `flex: 1`) control width. */
  width?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dark-theme skeleton block with a looping horizontal shimmer (no extra native deps).
 */
export function ShimmerBox({ height, width, borderRadius = 6, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [layoutW, setLayoutW] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [progress]);

  const stripeW = layoutW > 0 ? Math.max(48, layoutW * 0.42) : 56;
  const travel = layoutW > 0 ? layoutW + stripeW : 180;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-stripeW, travel],
  });

  return (
    <View
      style={[styles.track, { height, borderRadius }, width != null ? { width } : null, style]}
      onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.stripe,
          {
            width: stripeW,
            borderRadius: borderRadius + 2,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  stripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(248, 250, 252, 0.14)",
  },
});
