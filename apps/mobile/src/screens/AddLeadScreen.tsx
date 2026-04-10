import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../context/ToastContext";
import { Card } from "../components/Card";
import { formatPkrEnIn, parseDealValueInput } from "../lib/dealValue";
import { findDuplicateLeadByNameAndPhone } from "../lib/leadDuplicate";
import { normalizeLeadPriorityForDb } from "../lib/leadPriority";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import type { RootStackParamList, RootStackScreenProps } from "../navigation/types";

type AddLeadRouteProp = RouteProp<RootStackParamList, "AddLead">;
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { colors } from "../theme/colors";

type Props = RootStackScreenProps<"AddLead">;

/** Placeholder workspace for new leads (per product default). */
export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

/** UI order: High, Medium, Low — stored as `public.leads.priority` low | medium | high. */
const PRIORITY_OPTIONS = [
  { label: "High", value: "high" as const },
  { label: "Medium", value: "medium" as const },
  { label: "Low", value: "low" as const },
];

type PriorityUi = (typeof PRIORITY_OPTIONS)[number]["value"];

/**
 * UI labels → DB `source_channel` (check constraint: whatsapp | instagram | facebook | manual | other).
 * Referral & Cold Call map to `manual`.
 */
const SOURCE_OPTIONS = [
  { id: "whatsapp", label: "WhatsApp", db: "whatsapp" as const },
  { id: "instagram", label: "Instagram", db: "instagram" as const },
  { id: "facebook", label: "Facebook", db: "facebook" as const },
  { id: "referral", label: "Referral", db: "manual" as const },
  { id: "cold_call", label: "Cold Call", db: "manual" as const },
  { id: "manual", label: "Manual", db: "manual" as const },
  { id: "other", label: "Other", db: "other" as const },
] as const;

type SourceOptionId = (typeof SOURCE_OPTIONS)[number]["id"];

type DuplicateModalState = null | { kind: "namephone"; existingId: string; bypassPhoneDup: boolean };

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePhoneField(phoneTrimmed: string): string | undefined {
  const pt = phoneTrimmed.trim();
  if (!pt) {
    return "Phone is required";
  }
  if (!/^[+\d\s().-]+$/u.test(pt)) {
    return "Use digits only (and +, spaces, or dashes)";
  }
  const d = pt.replace(/\D/g, "");
  if (d.length < 10) {
    return "Enter at least 10 digits";
  }
  return undefined;
}

function validateAddLeadFields(input: {
  name: string;
  phone: string;
  email: string;
}): { name?: string; phone?: string; email?: string } {
  const errors: { name?: string; phone?: string; email?: string } = {};
  const n = input.name.trim();
  if (n.length < 2) {
    errors.name = n.length === 0 ? "Name is required" : "Name must be at least 2 characters";
  }
  const phoneErr = validatePhoneField(input.phone);
  if (phoneErr) errors.phone = phoneErr;
  const em = input.email.trim();
  if (em && !EMAIL_OK.test(em)) {
    errors.email = "Enter a valid email address";
  }
  return errors;
}

export function AddLeadScreen({ navigation }: Props) {
  const route = useRoute<AddLeadRouteProp>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
  const defaultLeadPriority = useAppPreferencesStore((s) => s.defaultLeadPriority);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [dealValueText, setDealValueText] = useState("");
  const [sourceId, setSourceId] = useState<SourceOptionId>("whatsapp");
  const [priority, setPriority] = useState<PriorityUi>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState<DuplicateModalState>(null);

  useFocusEffect(
    useCallback(() => {
      if (route.params?.prefill != null) return;
      setPriority(defaultLeadPriority);
    }, [defaultLeadPriority, route.params?.prefill]),
  );

  useEffect(() => {
    const prefill = route.params?.prefill;
    if (!prefill) return;
    if (typeof prefill.name === "string" && prefill.name.trim()) setName(prefill.name.trim());
    if (typeof prefill.phone === "string" && prefill.phone.trim()) setPhone(prefill.phone.trim());
    if (typeof prefill.email === "string" && prefill.email.trim()) setEmail(prefill.email.trim());
    if (typeof prefill.city === "string" && prefill.city.trim()) setCity(prefill.city.trim());
    if (typeof prefill.notes === "string" && prefill.notes.trim()) setNotes(prefill.notes.trim());
    if (typeof prefill.dealValueText === "string" && prefill.dealValueText.trim()) {
      setDealValueText(prefill.dealValueText.trim());
    }
    if (prefill.priority === "low" || prefill.priority === "medium" || prefill.priority === "high") {
      setPriority(prefill.priority);
    }
    navigation.setParams({ prefill: undefined });
  }, [route.params?.prefill, navigation]);

  const selectedSource = SOURCE_OPTIONS.find((o) => o.id === sourceId) ?? SOURCE_OPTIONS[0];
  const sourceDb = selectedSource.db;

  const parsedDealPreview = useMemo(() => parseDealValueInput(dealValueText), [dealValueText]);

  const clearForm = useCallback(() => {
    setName("");
    setPhone("");
    setEmail("");
    setCity("");
    setNotes("");
    setDealValueText("");
    setSourceId("whatsapp");
    setPriority("medium");
    setError(null);
    setNameError(null);
    setPhoneError(null);
    setEmailError(null);
  }, []);

  const performInsert = useCallback(
    async (bypassPhoneDup = false, bypassNamePhoneDup = false) => {
      const fieldErrors = validateAddLeadFields({ name, phone, email });
      setNameError(fieldErrors.name ?? null);
      setPhoneError(fieldErrors.phone ?? null);
      setEmailError(fieldErrors.email ?? null);
      if (Object.keys(fieldErrors).length > 0) {
        return;
      }

      const trimmedName = name.trim();
      if (!isSupabaseConfigured()) {
        setError(supabaseEnvError ?? "Supabase is not configured.");
        return;
      }

      const phoneTrim = phone.trim();
      const emailTrim = email.trim();

      setSaving(true);
      setError(null);
      try {
        const supabase = getSupabaseClient();

        if (!bypassPhoneDup) {
          const { data: existing } = await supabase
            .from("leads")
            .select("id, name")
            .eq("workspace_id", DEFAULT_WORKSPACE_ID)
            .eq("phone", phone.trim())
            .maybeSingle();

          if (existing && typeof existing === "object" && "id" in existing) {
            setSaving(false);
            const label =
              typeof existing.name === "string" && existing.name.trim()
                ? existing.name.trim()
                : "Unknown";
            const msg = `"${label}" already has this phone number. Add anyway?`;
            if (Platform.OS === "web") {
              const ok =
                typeof window !== "undefined" &&
                typeof window.confirm === "function" &&
                window.confirm(msg);
              if (!ok) return;
              void performInsert(true, false);
              return;
            }
            Alert.alert("", msg, [
              { text: "Cancel", style: "cancel" },
              { text: "Add anyway", onPress: () => void performInsert(true, false) },
            ]);
            return;
          }
        }

        if (!bypassNamePhoneDup) {
          const dup = await findDuplicateLeadByNameAndPhone(
            supabase,
            DEFAULT_WORKSPACE_ID,
            trimmedName,
            phoneTrim,
          );
          if (dup) {
            setSaving(false);
            setDuplicateModal({ kind: "namephone", existingId: dup.id, bypassPhoneDup });
            return;
          }
        }

        const dealVal = parseDealValueInput(dealValueText);
        const base: Record<string, unknown> = {
          name: trimmedName,
          phone: phoneTrim || null,
          email: emailTrim || null,
          city: city.trim() || null,
          notes: notes.trim() || null,
          status: "new",
          priority: normalizeLeadPriorityForDb(priority),
          workspace_id: DEFAULT_WORKSPACE_ID,
          deal_value: dealVal ?? 0,
          deal_currency: "PKR",
          /** Omit `created_by` so DB stays `null` — avoids FK errors if `profiles` row is missing. */
        };

        let ins = await supabase
          .from("leads")
          .insert({ ...base, source_channel: sourceDb })
          .select("id")
          .single();

        if (ins.error) {
          const msg = ins.error.message?.toLowerCase() ?? "";
          if (msg.includes("source_channel") && (msg.includes("column") || msg.includes("schema"))) {
            ins = await supabase.from("leads").insert({ ...base, source: sourceDb }).select("id").single();
          }
        }

        if (ins.error) {
          console.error("[AddLead] insert failed:", ins.error.code, ins.error.message, ins.error.details);
          const code = ins.error.code;
          const rawMsg = ins.error.message ?? "";
          if (
            code === "23505" ||
            /duplicate key value|unique constraint/i.test(rawMsg)
          ) {
            const friendly =
              "This phone number is already used for another lead in this workspace.";
            setError(friendly);
            showToast(friendly, "error");
            return;
          }
          const msg = rawMsg || "Could not save lead.";
          setError(msg);
          showToast(msg, "error");
          return;
        }

        const newId =
          ins.data != null && typeof ins.data === "object" && "id" in ins.data && ins.data.id != null
            ? String(ins.data.id)
            : null;

        bumpLeadsDataRevision();
        showToast("Lead added successfully", "success");
        clearForm();
        navigation.navigate("Main", {
          screen: "Pipeline",
          params: newId ? { scrollToLeadId: newId } : {},
        });
        navigation.goBack();
      } catch (e) {
        console.error("[AddLead]", e);
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setSaving(false);
      }
    },
    [
      name,
      phone,
      email,
      city,
      notes,
      dealValueText,
      sourceDb,
      priority,
      navigation,
      bumpLeadsDataRevision,
      showToast,
      clearForm,
    ],
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {!isSupabaseConfigured() ? (
          <Text style={styles.configErr}>{supabaseEnvError ?? "Supabase is not configured."}</Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card>
          <Text style={[styles.label, styles.labelFirst]}>Name *</Text>
          <TextInput
            style={[styles.input, nameError ? styles.inputInvalid : null]}
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (nameError) setNameError(null);
            }}
            placeholder="Lead name"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
            accessibilityLabel="Lead name"
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={[styles.input, phoneError ? styles.inputInvalid : null]}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              if (phoneError) setPhoneError(null);
            }}
            placeholder="Phone number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            editable={!saving}
            accessibilityLabel="Phone number"
          />
          {phoneError ? <Text style={styles.fieldError}>{phoneError}</Text> : null}

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputInvalid : null]}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (emailError) setEmailError(null);
            }}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
            accessibilityLabel="Email address"
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
          />

          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityRow}>
            {PRIORITY_OPTIONS.map((opt) => {
              const selected = priority === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.priorityPill, selected && styles.priorityPillSelected]}
                  onPress={() => setPriority(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.priorityText, selected && styles.priorityTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Source</Text>
          <Pressable
            style={[styles.input, styles.selectTrigger, saving && styles.selectDisabled]}
            onPress={() => !saving && setSourceModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Lead source"
            disabled={saving}
          >
            <Text style={styles.selectTriggerText}>{selectedSource.label}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </Pressable>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesTextArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes about this lead..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            editable={!saving}
            accessibilityLabel="Notes about this lead"
          />
          <Text style={styles.notesMeta}>{notes.length} / 500</Text>

          <Text style={styles.label}>Expected Deal Value (PKR)</Text>
          <TextInput
            style={styles.input}
            value={dealValueText}
            onChangeText={setDealValueText}
            placeholder="e.g. 500000"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            editable={!saving}
            accessibilityLabel="Expected deal value in PKR"
          />
          {parsedDealPreview != null && parsedDealPreview > 0 ? (
            <Text style={styles.dealPreview}>{formatPkrEnIn(parsedDealPreview)}</Text>
          ) : null}
        </Card>

        <Pressable
          style={({ pressed }) => [styles.primaryBtn, (pressed || saving) && styles.primaryBtnDisabled]}
          onPress={() => void performInsert()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save lead"
        >
          {saving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.primaryBtnText}>Save lead</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          onPress={() => navigation.goBack()}
          disabled={saving}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Cancel</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={sourceModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSourceModalOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdropFill} onPress={() => setSourceModalOpen(false)} accessibilityLabel="Dismiss" />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Source</Text>
            {SOURCE_OPTIONS.map((opt) => {
              const selected = sourceId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  style={[styles.modalRow, selected && styles.modalRowSelected]}
                  onPress={() => {
                    setSourceId(opt.id);
                    setSourceModalOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>{opt.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
            <Pressable style={styles.modalClose} onPress={() => setSourceModalOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={duplicateModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateModal(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdropFill} onPress={() => setDuplicateModal(null)} accessibilityLabel="Dismiss" />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Possible duplicate</Text>
            <Text style={styles.modalMessage}>
              A lead with this name and phone already exists. Add anyway?
            </Text>
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                const id = duplicateModal?.existingId;
                setDuplicateModal(null);
                if (id) navigation.replace("LeadDetail", { leadId: id });
              }}
              accessibilityRole="button"
            >
              <Text style={styles.modalRowText}>View existing lead</Text>
            </Pressable>
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                const m = duplicateModal;
                setDuplicateModal(null);
                if (!m) return;
                void performInsert(m.bypassPhoneDup, true);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.modalRowText, styles.modalRowTextPrimary]}>Add anyway</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setDuplicateModal(null)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  configErr: { color: colors.danger, marginBottom: 12, fontSize: 14 },
  error: { color: colors.danger, marginBottom: 12, fontSize: 14 },
  fieldError: { color: colors.danger, fontSize: 13, marginTop: 6, fontWeight: "600" },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  labelFirst: { marginTop: 0 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.cardSoft,
  },
  inputInvalid: { borderColor: colors.danger },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectDisabled: { opacity: 0.7 },
  selectTriggerText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  notesTextArea: { minHeight: 80, paddingTop: 12 },
  notesMeta: { alignSelf: "flex-end", color: colors.textMuted, fontSize: 12, marginTop: 6 },
  dealPreview: { color: colors.success, fontSize: 15, fontWeight: "700", marginTop: 8 },
  priorityRow: { flexDirection: "row", gap: 10 },
  priorityPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  priorityPillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  priorityText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  priorityTextSelected: { color: colors.primary },
  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnPressed: { opacity: 0.85 },
  secondaryBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 15 },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
  },
  modalSheet: {
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    maxHeight: "72%",
    zIndex: 1,
  },
  modalTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalMessage: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalRowSelected: { backgroundColor: colors.cardSoft },
  modalRowText: { color: colors.text, fontSize: 16 },
  modalRowTextPrimary: { color: colors.primary, fontWeight: "700" },
  modalRowTextSelected: { color: colors.primary, fontWeight: "700" },
  modalClose: {
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  modalCloseText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
});
