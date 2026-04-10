import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { parseDealValueInput } from "../lib/dealValue";
import { findExistingLeadByPhone } from "../lib/leadDuplicate";
import { normalizeLeadPriorityForDb } from "../lib/leadPriority";
import {
  discardVoiceRecording,
  requestVoiceRecordingPermission,
  startVoiceRecording,
  stopVoiceRecording,
} from "../lib/voiceRecording";
import { extractLeadFromTranscript, processVoiceRecordingWithEdge, type VoiceToLeadResult } from "../lib/voiceToLeadApi";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import type { AddLeadPrefill, RootStackParamList } from "../navigation/types";
import { useAppStore } from "../state/useAppStore";
import { colors } from "../theme/colors";

const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";
const VIOLET = "#7c3aed";

const STAGE_OPTIONS = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal_sent", label: "Proposal" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
] as const;

const PRIORITY_OPTIONS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

function formatMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function dealValueToText(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "";
  return String(Math.round(v));
}

/** Same rules as AddLeadScreen `validatePhoneField` (digit count, not raw string length). */
function validatePhoneForLeadInsert(phoneTrimmed: string): string | undefined {
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

/** DB `leads.status` — lowercase (see AddLeadScreen / migrations). */
function normalizeVoiceStageForDb(raw: string): string {
  const s = STAGE_OPTIONS.some((o) => o.id === raw) ? raw : "new";
  return s;
}

function formatSupabaseError(err: { message?: string; code?: string; details?: string; hint?: string }): string {
  const parts = [err.message, err.hint, err.details].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  return parts.length ? parts.join(" — ") : "Could not save lead.";
}

type Step = "record" | "processing" | "manual_transcript" | "review";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function VoiceToLeadFlow({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [step, setStep] = useState<Step>("record");
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [procError, setProcError] = useState<string | null>(null);
  const [manualTranscript, setManualTranscript] = useState("");
  const [saving, setSaving] = useState(false);

  const [summary, setSummary] = useState("");
  const [action, setAction] = useState<"create" | "update">("create");
  const [resolvedLeadId, setResolvedLeadId] = useState<string | undefined>(undefined);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [dealValueText, setDealValueText] = useState("");
  const [stage, setStage] = useState<string>("new");
  const [priority, setPriority] = useState<string>("medium");

  const pulse = useRef(new Animated.Value(1)).current;

  const reset = useCallback(() => {
    setStep("record");
    setIsRecording(false);
    setSeconds(0);
    setProcError(null);
    setManualTranscript("");
    setSaving(false);
    setSummary("");
    setAction("create");
    setResolvedLeadId(undefined);
    setName("");
    setPhone("");
    setCity("");
    setNotes("");
    setDealValueText("");
    setStage("new");
    setPriority("medium");
  }, []);

  useEffect(() => {
    if (visible) {
      reset();
      void discardVoiceRecording();
    }
  }, [visible, reset]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  const applyVoiceResult = useCallback((result: VoiceToLeadResult) => {
    const ld = result.leadData;
    setAction(result.action);
    setResolvedLeadId(result.leadId);
    setSummary(result.summary);
    setName(ld.name);
    setPhone(ld.phone);
    setCity(ld.city);
    setNotes(ld.notes);
    setDealValueText(dealValueToText(ld.dealValue));
    const st = ld.stage;
    setStage(STAGE_OPTIONS.some((s) => s.id === st) ? st : "new");
    setPriority(PRIORITY_OPTIONS.some((p) => p.id === ld.priority) ? ld.priority : "medium");
    setStep("review");
  }, []);

  const navigateToAddLeadPrefill = useCallback(
    (prefill: AddLeadPrefill) => {
      const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
      if (parent) {
        parent.navigate("AddLead", { prefill });
      } else {
        navigation.navigate("AddLead", { prefill });
      }
    },
    [navigation],
  );

  const handleClose = useCallback(async () => {
    if (isRecording) {
      await discardVoiceRecording();
      setIsRecording(false);
    }
    reset();
    onClose();
  }, [isRecording, onClose, reset]);

  /** Start recording only; use “Stop & Process” or Cancel to end. */
  const onPressMic = useCallback(async () => {
    if (isRecording) return;
    setProcError(null);
    const ok = await requestVoiceRecordingPermission();
    if (!ok) {
      showToast("Microphone permission is required.", "error");
      return;
    }
    try {
      setSeconds(0);
      await startVoiceRecording();
      setIsRecording(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not start recording.", "error");
    }
  }, [isRecording, showToast]);

  const onStopAndProcess = useCallback(async () => {
    if (!isRecording) {
      showToast("Start recording first.", "error");
      return;
    }
    console.log("[VoiceToLeadFlow] Stop & Process tapped");
    setStep("processing");
    setProcError(null);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(supabaseEnvError ?? "Supabase is not configured.");
      }
      const stopped = await stopVoiceRecording();
      setIsRecording(false);
      console.log("[VoiceToLeadFlow] stopped audio", stopped.platform, stopped.platform === "web" ? stopped.blob.size : "native");

      const result = await processVoiceRecordingWithEdge(stopped);
      console.log("[VoiceToLeadFlow] edge OK, transcript len", result.transcript?.length ?? 0);
      applyVoiceResult(result);
    } catch (e) {
      const err = e as Error & { code?: string; httpStatus?: number };
      console.error("[VoiceToLeadFlow] process error", err.message, err.code, err.httpStatus);
      const whisperFallback =
        err.code === "whisper_failed" || err.httpStatus === 422 || /transcription|whisper/i.test(err.message);

      if (whisperFallback) {
        showToast("Couldn't transcribe audio. Type your notes below.", "error");
        setManualTranscript("");
        setStep("manual_transcript");
        setSeconds(0);
        return;
      }

      const msg = err.message || "Processing failed.";
      setProcError(msg);
      showToast(msg, "error");
      setIsRecording(false);
      setStep("record");
      setSeconds(0);
    }
  }, [isRecording, showToast, applyVoiceResult]);

  const onManualExtract = useCallback(async () => {
    const t = manualTranscript.trim();
    if (t.length < 8) {
      showToast("Enter at least a short transcript.", "error");
      return;
    }
    console.log("[VoiceToLeadFlow] manual extract, len", t.length);
    setStep("processing");
    setProcError(null);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error(supabaseEnvError ?? "Supabase is not configured.");
      }
      const result = await extractLeadFromTranscript(t);
      applyVoiceResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Processing failed.";
      console.error("[VoiceToLeadFlow] manual extract error", msg);
      setProcError(msg);
      showToast(msg, "error");
      setStep("manual_transcript");
    }
  }, [manualTranscript, showToast, applyVoiceResult]);

  const onConfirmSave = useCallback(async () => {
    const n = name.trim();
    const p = phone.trim();
    if (n.length < 2) {
      showToast("Name must be at least 2 characters.", "error");
      return;
    }
    const phoneErr = validatePhoneForLeadInsert(p);
    if (phoneErr) {
      console.warn("[VoiceToLeadFlow] validation phone", phoneErr, p);
      showToast(phoneErr, "error");
      return;
    }
    if (!isSupabaseConfigured()) {
      showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const dealVal = parseDealValueInput(dealValueText) ?? 0;
      const pri = normalizeLeadPriorityForDb(priority);
      const st = normalizeVoiceStageForDb(stage);
      const notesBlock = [notes.trim(), summary.trim() ? `(Voice summary: ${summary.trim()})` : ""]
        .filter(Boolean)
        .join("\n\n");

      const updateId =
        action === "update" && resolvedLeadId
          ? resolvedLeadId
          : (await findExistingLeadByPhone(supabase, DEFAULT_WORKSPACE_ID, p))?.id;

      if (updateId) {
        console.log("[VoiceToLeadFlow] save:update", { updateId, name: n, phone: p, status: st, priority: pri });

        const { data: row } = await supabase.from("leads").select("notes").eq("id", updateId).maybeSingle();
        const prevNotes = row != null && typeof row === "object" && "notes" in row && typeof row.notes === "string"
          ? row.notes
          : "";
        const mergedNotes = [prevNotes?.trim(), notesBlock].filter(Boolean).join("\n\n");

        const { data: updData, error: updErr } = await supabase
          .from("leads")
          .update({
            name: n,
            phone: p,
            city: city.trim() || null,
            notes: mergedNotes || null,
            deal_value: dealVal,
            deal_currency: "PKR",
            status: st,
            priority: pri,
          })
          .eq("id", updateId)
          .select("id")
          .maybeSingle();

        if (updErr) {
          console.error("[VoiceToLeadFlow] update failed", updErr.code, updErr.message, updErr.details);
          showToast(formatSupabaseError(updErr), "error");
          return;
        }
        console.log("[VoiceToLeadFlow] save:update ok", updData);

        bumpLeadsDataRevision();
        showToast("Lead updated from voice note! 🎤", "success");
        void handleClose();
        return;
      }

      const base: Record<string, unknown> = {
        name: n,
        phone: p,
        email: null,
        city: city.trim() || null,
        notes: notesBlock || null,
        status: st,
        priority: pri,
        workspace_id: DEFAULT_WORKSPACE_ID,
        deal_value: dealVal,
        deal_currency: "PKR",
      };

      console.log("[VoiceToLeadFlow] save:insert payload", {
        ...base,
        source_channel: "manual",
      });

      let ins = await supabase.from("leads").insert({ ...base, source_channel: "manual" }).select("id").single();

      if (ins.error) {
        const msg = ins.error.message?.toLowerCase() ?? "";
        console.warn("[VoiceToLeadFlow] insert first attempt error", ins.error.code, ins.error.message);
        if (msg.includes("source_channel") && (msg.includes("column") || msg.includes("schema"))) {
          ins = await supabase.from("leads").insert({ ...base, source: "manual" }).select("id").single();
        }
      }

      if (ins.error) {
        console.error(
          "[VoiceToLeadFlow] insert failed",
          ins.error.code,
          ins.error.message,
          ins.error.details,
          ins.error.hint,
        );
        showToast(formatSupabaseError(ins.error), "error");
        return;
      }

      console.log("[VoiceToLeadFlow] save:insert ok", ins.data);

      const newId =
        ins.data != null && typeof ins.data === "object" && "id" in ins.data && ins.data.id != null
          ? String(ins.data.id)
          : null;

      if (!newId) {
        console.error("[VoiceToLeadFlow] insert returned no id", ins);
        showToast("Lead may have been created but no id was returned. Check the pipeline.", "error");
        bumpLeadsDataRevision();
        void handleClose();
        return;
      }

      bumpLeadsDataRevision();
      showToast("Lead created from voice note! 🎤", "success");
      void handleClose();

      const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
      if (parent) {
        parent.navigate("Main", {
          screen: "Pipeline",
          params: { scrollToLeadId: newId },
        });
      }
    } catch (e) {
      console.error("[VoiceToLeadFlow] save exception", e);
      showToast(e instanceof Error ? e.message : "Could not save lead.", "error");
    } finally {
      setSaving(false);
    }
  }, [
    name,
    phone,
    city,
    notes,
    dealValueText,
    stage,
    priority,
    summary,
    action,
    resolvedLeadId,
    showToast,
    bumpLeadsDataRevision,
    handleClose,
    navigation,
  ]);

  const onEditBeforeSaving = useCallback(() => {
    const prefill: AddLeadPrefill = {
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      notes: notes.trim(),
      dealValueText: dealValueText.trim(),
      priority: normalizeLeadPriorityForDb(priority) as AddLeadPrefill["priority"],
    };
    handleClose();
    navigateToAddLeadPrefill(prefill);
  }, [name, phone, city, notes, dealValueText, priority, handleClose, navigateToAddLeadPrefill]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {step !== "review" ? (
          <View style={styles.recordSheet}>
            <View style={styles.recordHeaderRow}>
              <Text style={styles.recordTitle}>Voice Note 🎤</Text>
              <Pressable onPress={() => void handleClose()} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.linkMuted}>Cancel</Text>
              </Pressable>
            </View>

            {step === "processing" ? (
              <View style={styles.processingBox}>
                <ActivityIndicator size="large" color={VIOLET} />
                <Text style={styles.processingText}>Processing…</Text>
                <Text style={styles.processingSub}>Transcribing audio and extracting lead details</Text>
                {procError ? <Text style={styles.procErr}>{procError}</Text> : null}
              </View>
            ) : step === "manual_transcript" ? (
              <>
                <Text style={styles.recordSubtitle}>Type your meeting notes</Text>
                <Text style={styles.hint}>
                  Automatic transcription failed or was unavailable. Paste what you said — we will still extract lead
                  fields with AI.
                </Text>
                <TextInput
                  style={styles.manualTranscriptInput}
                  value={manualTranscript}
                  onChangeText={setManualTranscript}
                  placeholder="e.g. Met Ahmed from Lahore, 10 panels, budget 5 lakh, call Tuesday…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                />
                <Pressable
                  style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
                  onPress={() => void onManualExtract()}
                >
                  <Text style={styles.createBtnText}>Extract lead from text</Text>
                </Pressable>
                <Pressable style={styles.cancelRow} onPress={() => setStep("record")}>
                  <Text style={styles.linkMuted}>← Record again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.recordSubtitle}>Speak about your meeting or new lead</Text>
                <Text style={styles.hint}>
                  Example: “I just met Ahmed from Lahore, 10 panel system, budget 5 lakh, follow up next Tuesday.”
                </Text>

                <View style={styles.recordCenter}>
                  <Pressable
                    onPress={() => void onPressMic()}
                    disabled={isRecording}
                    accessibilityRole="button"
                    accessibilityLabel={isRecording ? "Recording" : "Start recording"}
                  >
                    <Animated.View
                      style={[
                        styles.recordCircle,
                        isRecording ? styles.recordCircleHot : styles.recordCircleIdle,
                        { transform: [{ scale: isRecording ? pulse : 1 }] },
                      ]}
                    >
                      <Ionicons name="mic" size={44} color="#fff" />
                    </Animated.View>
                  </Pressable>
                  <Text style={styles.timer}>{formatMmSs(seconds)}</Text>
                  <Text style={styles.tapHint}>{isRecording ? "Recording…" : "Tap the mic to start"}</Text>
                </View>

                <Pressable
                  style={[styles.stopProcessBtn, !isRecording && styles.stopProcessBtnDim]}
                  disabled={!isRecording}
                  onPress={() => void onStopAndProcess()}
                  accessibilityRole="button"
                  accessibilityLabel="Stop and process voice note"
                >
                  <Text style={styles.stopProcessBtnText}>Stop & Process</Text>
                </Pressable>

                <Pressable style={styles.cancelRow} onPress={() => void handleClose()} accessibilityRole="button">
                  <Text style={styles.linkMuted}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.reviewScroll}
            contentContainerStyle={styles.reviewScrollContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.recordHeaderRow}>
              <Text style={styles.recordTitle}>Review</Text>
              <Pressable onPress={() => void handleClose()} accessibilityRole="button">
                <Text style={styles.linkMuted}>Discard</Text>
              </Pressable>
            </View>
            <Text style={styles.reviewLeadLabel}>AI extracted this lead:</Text>
            {summary.trim() ? <Text style={styles.summaryLine}>{summary}</Text> : null}

            <Text style={styles.fieldLab}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLab}>Phone *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLab}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="City"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLab}>Deal value (PKR)</Text>
            <TextInput
              style={styles.input}
              value={dealValueText}
              onChangeText={setDealValueText}
              placeholder="e.g. 500000"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={styles.fieldLab}>Stage</Text>
            <View style={styles.chipRow}>
              {STAGE_OPTIONS.map((s) => {
                const on = stage === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setStage(s.id)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLab}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map((s) => {
                const on = priority === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => setPriority(s.id)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLab}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.editHint}>You can edit any field before saving.</Text>

            <Pressable
              style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed, saving && styles.btnDisabled]}
              onPress={() => void onConfirmSave()}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Create or update lead"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>
                  {resolvedLeadId || action === "update" ? "✓ Save lead" : "✓ Create Lead"}
                </Text>
              )}
            </Pressable>

            <Pressable style={styles.secondaryBtn} onPress={onEditBeforeSaving} disabled={saving}>
              <Text style={styles.secondaryBtnText}>Edit before saving</Text>
            </Pressable>

            <Pressable style={styles.discardBtn} onPress={() => void handleClose()} disabled={saving}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  recordSheet: { flex: 1, paddingHorizontal: 20 },
  recordHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  recordTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  recordSubtitle: { color: colors.textMuted, fontSize: 15, marginBottom: 10, lineHeight: 22 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 24, fontStyle: "italic" },
  recordCenter: { alignItems: "center", marginVertical: 24 },
  recordCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  recordCircleIdle: { backgroundColor: VIOLET },
  recordCircleHot: { backgroundColor: colors.danger },
  timer: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 16 },
  tapHint: { color: colors.textMuted, marginTop: 8, fontSize: 14 },
  stopProcessBtn: {
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  stopProcessBtnDim: { opacity: 0.45 },
  stopProcessBtnText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  cancelRow: { alignItems: "center", marginTop: 20, paddingBottom: 16 },
  linkMuted: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  processingBox: { alignItems: "center", paddingVertical: 48, gap: 12 },
  processingText: { color: colors.text, fontSize: 18, fontWeight: "700" },
  processingSub: { color: colors.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 20, lineHeight: 18 },
  procErr: { color: colors.warning, textAlign: "center", paddingHorizontal: 16 },
  manualTranscriptInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 140,
    maxHeight: 260,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.cardSoft,
    marginBottom: 12,
  },
  reviewScroll: { flex: 1 },
  reviewScrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  reviewLeadLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  summaryLine: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  fieldLab: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
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
  notesInput: { minHeight: 100, maxHeight: 200 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: VIOLET, backgroundColor: `${VIOLET}22` },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: colors.text },
  editHint: { color: colors.textMuted, fontSize: 13, marginTop: 16, marginBottom: 8 },
  createBtn: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnPressed: { opacity: 0.92 },
  btnDisabled: { opacity: 0.6 },
  createBtnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  secondaryBtn: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  secondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  discardBtn: { alignItems: "center", paddingVertical: 12 },
  discardBtnText: { color: colors.textMuted, fontWeight: "600", fontSize: 15 },
});
