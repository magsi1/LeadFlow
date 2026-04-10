import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";

export type ToastType = "info" | "success" | "error";

export type ShowToastOptions = {
  /** Default: 3000ms, or 5000ms when `onUndo` is set (unless overridden). */
  durationMs?: number;
  onUndo?: () => void | Promise<void>;
};

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  onUndo?: () => void | Promise<void>;
};

type ToastContextValue = {
  showToast: (message: string, type: ToastType, options?: ShowToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdSeq = 0;

function toastAccent(type: ToastType): string {
  switch (type) {
    case "info":
      return colors.primary;
    case "success":
      return colors.brandGreen;
    case "error":
      return colors.danger;
    default:
      return colors.border;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType, options?: ShowToastOptions) => {
      const id = `toast-${++toastIdSeq}`;
      const hasUndo = typeof options?.onUndo === "function";
      const durationMs = options?.durationMs ?? (hasUndo ? 5000 : 3000);
      const item: ToastItem = {
        id,
        message,
        type,
        onUndo: options?.onUndo,
      };
      setToasts((list) => [item, ...list].slice(0, 6));
      const tid = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((list) => list.filter((x) => x.id !== id));
      }, durationMs);
      timersRef.current.set(id, tid);
    },
    [],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        style={[
          styles.host,
          {
            top: 12 + insets.top,
            left: 12 + insets.left,
            right: 12 + insets.right,
          },
        ]}
        pointerEvents="box-none"
      >
        {toasts.map((t) => (
          <View
            key={t.id}
            style={[styles.toast, { borderLeftColor: toastAccent(t.type), borderLeftWidth: 4 }]}
            accessibilityRole="alert"
          >
            <Text style={styles.toastMessage}>{t.message}</Text>
            <View style={styles.toastActions}>
              {t.onUndo ? (
                <Pressable
                  onPress={() => {
                    removeToast(t.id);
                    void Promise.resolve(t.onUndo?.());
                  }}
                  style={({ pressed }) => [styles.undoBtn, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Undo"
                >
                  <Text style={styles.undoBtnText}>Undo</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => removeToast(t.id)}
                style={({ pressed }) => [styles.dismissBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.dismissBtnText}>×</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    zIndex: 9999,
    gap: 8,
    flexDirection: "column",
  },
  toast: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
      web: {
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
      } as object,
      default: {},
    }),
  },
  toastMessage: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  toastActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  undoBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  undoBtnText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  dismissBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dismissBtnText: {
    color: colors.textMuted,
    fontSize: 20,
    fontWeight: "400",
    lineHeight: 22,
  },
  pressed: { opacity: 0.85 },
});
