import { Alert, Platform } from "react-native";

/**
 * `Alert.alert` is unreliable on Expo web; use `globalThis.confirm` there.
 * Use for destructive confirmations — not for navigation-only actions (e.g. AI reply).
 */
export function crossPlatformConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  destructiveLabel = "Delete",
): void {
  if (Platform.OS === "web") {
    const ok =
      typeof window !== "undefined" &&
      typeof window.confirm === "function" &&
      window.confirm(`${title}\n\n${message}`);
    if (ok) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: destructiveLabel, style: "destructive", onPress: onConfirm },
    ]);
  }
}
