import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useToast } from "../context/ToastContext";
import { formatSafeDateTime } from "../lib/safeData";
import { updateLeadNextFollowUpAt } from "../lib/leadFollowUp";
import { colors } from "../theme/colors";

function defaultPickerDate(nextIso: string | null | undefined): Date {
  if (nextIso?.trim()) {
    const d = new Date(nextIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(9, 0, 0, 0);
  return t;
}

export type OpenFollowUpPickerOptions = {
  initialDate?: Date;
  /** Default `date` (09:00 local on chosen day). Use `datetime` with `preserveTime` for AI-suggested times. */
  mode?: "date" | "datetime";
  /** When `mode` is `datetime`, save the picked clock time; when `date`, day is normalized to 09:00 local. */
  preserveTime?: boolean;
  /** If set, shown instead of the default scheduled toast after save. */
  successToastMessage?: string | null;
};

type Props = {
  leadId: string;
  nextFollowUpAt?: string | null;
  disabled?: boolean;
  /** Pipeline uses full label; inbox can use compact. */
  compact?: boolean;
  /** Defaults to "Set follow-up". */
  label?: string;
  onSaved: (iso: string) => void;
  /**
   * When set, tap does not open the picker immediately. Call `openPicker` when ready
   * (e.g. after smart suggestions).
   */
  interceptPress?: (helpers: { openPicker: (opts?: OpenFollowUpPickerOptions) => void }) => void;
};

export function SetFollowUpButton({
  leadId,
  nextFollowUpAt,
  disabled,
  compact,
  label = "Set follow-up",
  onSaved,
  interceptPress,
}: Props) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [draft, setDraft] = useState(() => defaultPickerDate(nextFollowUpAt));
  const [pickerMode, setPickerMode] = useState<"date" | "datetime">("date");
  const preserveTimeRef = useRef(false);
  const successToastRef = useRef<string | null>(null);

  const persist = useCallback(
    async (d: Date) => {
      setSaving(true);
      try {
        const iso = await updateLeadNextFollowUpAt(leadId, d, { preserveTime: preserveTimeRef.current });
        onSaved(iso);
        const custom = successToastRef.current;
        successToastRef.current = null;
        const message =
          custom != null && String(custom).trim() !== ""
            ? String(custom).trim()
            : `Follow-up scheduled for ${formatSafeDateTime(iso, "—")}`;
        showToast(message, "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not save follow-up.", "error");
      } finally {
        setSaving(false);
      }
    },
    [leadId, onSaved, showToast],
  );

  const openPicker = useCallback(
    (opts?: OpenFollowUpPickerOptions) => {
      successToastRef.current = opts?.successToastMessage ?? null;
      const mode = opts?.mode ?? "date";
      setPickerMode(mode);
      preserveTimeRef.current = opts?.preserveTime ?? mode === "datetime";
      setDraft(opts?.initialDate ?? defaultPickerDate(nextFollowUpAt));
      if (Platform.OS === "android") {
        setAndroidOpen(true);
      } else {
        setIosOpen(true);
      }
    },
    [nextFollowUpAt],
  );

  const onPress = useCallback(() => {
    if (interceptPress) {
      interceptPress({ openPicker });
      return;
    }
    openPicker();
  }, [interceptPress, openPicker]);

  const onAndroidChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      setAndroidOpen(false);
      if (event.type === "dismissed") {
        successToastRef.current = null;
        return;
      }
      if (selected) void persist(selected);
    },
    [persist],
  );

  const busy = disabled || saving;

  const modalTitle = pickerMode === "datetime" ? "Follow-up date & time" : "Follow-up date";

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          compact ? styles.btnCompact : styles.btn,
          pressed && styles.pressed,
          busy && styles.btnDisabled,
        ]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Set follow-up date"
      >
        {saving ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <>
            <Ionicons name="calendar-outline" size={compact ? 16 : 18} color={colors.primary} />
            <Text style={compact ? styles.btnTextCompact : styles.btnText}>{label}</Text>
          </>
        )}
      </Pressable>

      {androidOpen ? (
        <DateTimePicker
          value={draft}
          mode={pickerMode}
          display="default"
          onChange={onAndroidChange}
        />
      ) : null}

      <Modal visible={iosOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <DateTimePicker
              value={draft}
              mode={pickerMode}
              display="spinner"
              onChange={(_, date) => {
                if (date) setDraft(date);
              }}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalBtnGhost, pressed && styles.pressed]}
                onPress={() => {
                  successToastRef.current = null;
                  setIosOpen(false);
                }}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtnPrimary, pressed && styles.pressed]}
                onPress={() => {
                  setIosOpen(false);
                  void persist(draft);
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  btnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  btnTextCompact: { color: colors.primary, fontWeight: "700", fontSize: 12 },
  btnDisabled: { opacity: 0.65 },
  pressed: { opacity: 0.88 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 12 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: colors.textMuted, fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  modalBtnPrimaryText: { color: colors.text, fontWeight: "800", fontSize: 15 },
});
