import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { useToast } from "../context/ToastContext";
import { formatPkrEnIn, parseDealValueInput } from "../lib/dealValue";
import { normalizeLeadPriorityForDb } from "../lib/leadPriority";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import type { RootStackScreenProps } from "../navigation/types";
import { colors } from "../theme/colors";

type Props = RootStackScreenProps<"EditLead">;

const PRIORITY_OPTIONS = [
  { label: "High", value: "high" as const },
  { label: "Medium", value: "medium" as const },
  { label: "Low", value: "low" as const },
];

type PriorityUi = (typeof PRIORITY_OPTIONS)[number]["value"];

const SOURCE_OPTIONS = [
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "Manual", value: "manual" },
  { label: "Other", value: "other" },
] as const;

const STATUS_OPTIONS = [
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Qualified", value: "qualified" },
  { label: "Proposal sent", value: "proposal_sent" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
] as const;

function dbPriorityToUi(db: string | null | undefined): PriorityUi {
  const x = (db ?? "").toLowerCase().trim();
  if (x === "low" || x === "cold") return "low";
  if (x === "high" || x === "hot") return "high";
  if (x === "medium" || x === "warm") return "medium";
  return "medium";
}

function normalizeSource(raw: unknown): (typeof SOURCE_OPTIONS)[number]["value"] {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  const allowed = new Set(SOURCE_OPTIONS.map((o) => o.value));
  if (allowed.has(s as (typeof SOURCE_OPTIONS)[number]["value"])) {
    return s as (typeof SOURCE_OPTIONS)[number]["value"];
  }
  return "manual";
}

function normalizeStatus(raw: unknown): (typeof STATUS_OPTIONS)[number]["value"] {
  const s = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  const allowed = new Set(STATUS_OPTIONS.map((o) => o.value));
  if (allowed.has(s as (typeof STATUS_OPTIONS)[number]["value"])) {
    return s as (typeof STATUS_OPTIONS)[number]["value"];
  }
  return "new";
}

export function EditLeadScreen({ navigation, route }: Props) {
  const leadId = route.params?.leadId?.trim() ?? "";
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<(typeof SOURCE_OPTIONS)[number]["value"]>("whatsapp");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("new");
  const [priority, setPriority] = useState<PriorityUi>("medium");
  const [dealValueText, setDealValueText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!leadId) {
        setLoadError("Missing lead id.");
        setLoading(false);
        return;
      }
      if (!isSupabaseConfigured()) {
        setLoadError(supabaseEnvError ?? "Supabase is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = getSupabaseClient();
        const { data, error: qErr } = await supabase
          .from("leads")
          .select("id,name,phone,email,city,notes,status,priority,source,source_channel,deal_value,deal_currency")
          .eq("id", leadId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) throw new Error(qErr.message);
        if (!data || typeof data !== "object") {
          setLoadError("Lead not found.");
          return;
        }
        const row = data as Record<string, unknown>;
        setName(typeof row.name === "string" ? row.name : "");
        setPhone(typeof row.phone === "string" ? row.phone : "");
        setEmail(typeof row.email === "string" ? row.email : "");
        setCity(typeof row.city === "string" ? row.city : "");
        setNotes(typeof row.notes === "string" ? row.notes : "");
        setSource(normalizeSource(row.source ?? row.source_channel));
        setStatus(normalizeStatus(row.status));
        setPriority(dbPriorityToUi(typeof row.priority === "string" ? row.priority : null));
        const dv = row.deal_value;
        const dvNum =
          typeof dv === "number" && Number.isFinite(dv)
            ? dv
            : typeof dv === "string" && dv.trim() !== "" && Number.isFinite(Number(dv))
              ? Number(dv)
              : 0;
        setDealValueText(dvNum > 0 ? String(Math.round(dvNum)) : "");
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load lead.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const save = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!leadId) {
      setError("Missing lead id.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError(supabaseEnvError ?? "Supabase is not configured.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const dealVal = parseDealValueInput(dealValueText);
      const base = {
        name: trimmedName,
        phone: phone.trim() || null,
        email: email.trim() || null,
        city: city.trim() || null,
        notes: notes.trim() || null,
        status,
        priority: normalizeLeadPriorityForDb(priority),
        deal_value: dealVal ?? 0,
        deal_currency: "PKR",
      };

      let up = await supabase.from("leads").update({ ...base, source }).eq("id", leadId);
      if (up.error) {
        const msg = up.error.message?.toLowerCase() ?? "";
        if (msg.includes("source") && (msg.includes("column") || msg.includes("schema"))) {
          up = await supabase.from("leads").update({ ...base, source_channel: source }).eq("id", leadId);
        }
      }

      if (up.error) {
        console.error("[EditLead] update failed:", up.error);
        showToast(up.error.message || "Could not save lead.", "error");
        return;
      }

      showToast("Lead updated", "success");
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  }, [name, phone, email, city, notes, dealValueText, status, priority, source, leadId, navigation, showToast]);

  const disabled = saving || loading || !leadId || !name.trim();

  const parsedDealPreview = useMemo(() => parseDealValueInput(dealValueText), [dealValueText]);

  if (loading) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>Loading lead…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom, paddingHorizontal: 24 }]}>
        <Text style={styles.errTitle}>Cannot edit lead</Text>
        <Text style={styles.errBody}>{loadError}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Card>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Lead name"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!saving}
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
          />

          <Text style={styles.label}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((opt) => {
              const selected = status === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setStatus(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Source</Text>
          <View style={styles.chipRow}>
            {SOURCE_OPTIONS.map((opt) => {
              const selected = source === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSource(opt.value)}
                  disabled={saving}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

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

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            editable={!saving}
          />

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
          style={({ pressed }) => [styles.primaryBtn, (pressed || disabled) && styles.primaryBtnDisabled]}
          onPress={() => void save()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          {saving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.primaryBtnText}>Save changes</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  hint: { color: colors.textMuted, marginTop: 12, fontSize: 15 },
  errTitle: { color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  errBody: { color: colors.textMuted, marginTop: 8, textAlign: "center", fontSize: 15 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  error: { color: colors.danger, marginBottom: 12, fontSize: 14 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
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
  textArea: { minHeight: 100, paddingTop: 12 },
  dealPreview: { color: colors.success, fontSize: 15, fontWeight: "700", marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: colors.primary },
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
});
