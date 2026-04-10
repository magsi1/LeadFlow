import { useEffect, useRef, type ReactNode } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

/** Subtle opacity fade-in when content mounts. */
export function FadeIn({ children, style }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return <Animated.View style={[styles.wrap, { opacity }, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  wrap: {},
});
