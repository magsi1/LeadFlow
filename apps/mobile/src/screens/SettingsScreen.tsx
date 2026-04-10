import * as Device from "expo-device";
import { useFocusEffect } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { createElement, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { useToast } from "../context/ToastContext";
import {
  buildPhoneDuplicateClusters,
  defaultPrimaryId,
  formatLeadStageLabel,
  orderClusterLeadsWithPrimary,
  type DataMgmtLeadRow,
  type SettingsDuplicateCluster,
} from "../lib/dataManagementDuplicates";
import { cleanName } from "../lib/whatsappChatImport";
import { deleteLeadWithUndoToast } from "../lib/leadUndoDelete";
import {
  applySmartDeleteFilters,
  fetchAllMatchingLeadIds,
  isValidYmdRange,
  parseYmdLocalStart,
  type SmartDeleteFilters,
  type SmartDeletePriority,
  type SmartDeleteSource,
  type SmartDeleteStage,
  ymdLocalFromDate,
} from "../lib/smartBulkDelete";
import { leadDisplayName } from "../lib/safeData";
import { getSupabaseClient, isSupabaseConfigured } from "../lib/supabaseClient";
import type { DefaultLeadPriority } from "../lib/appPreferences";
import { crossPlatformConfirm } from "../lib/crossPlatformConfirm";
import { mergeAppPreferences, TIMEZONE_OPTIONS } from "../lib/appPreferences";
import { isSuspiciousLeadName } from "../lib/testLeadDetection";
import { api } from "../services/api";
import {
  cancelAllNotifications,
  refreshDailyDigestSchedule,
  sendImmediateDigest,
} from "../services/notificationService";
import { getNotificationPermissionStatus, registerExpoPushToken } from "../services/push";
import { useAppStore } from "../state/useAppStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { useAuthStore } from "../state/useAuthStore";
import { colors } from "../theme/colors";
import type { MainTabScreenProps } from "../navigation/types";
import type { InboxLeadRow } from "../types/models";

function describePushStatus(status: string | null, isPhysical: boolean): string {
  if (!isPhysical) {
    return "Push requires a physical device.";
  }
  if (status === "granted") return "Allowed — device can receive notifications.";
  if (status === "denied") return "Blocked — enable notifications in system settings.";
  return "Not determined — tap below to request access.";
}

function deleteConfirmLabel(lead: DataMgmtLeadRow | InboxLeadRow): string {
  const raw = typeof lead.name === "string" ? lead.name.trim() : "";
  return raw.length > 0 ? raw : "(unnamed)";
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Substrings that count as known business names (case-insensitive). */
const IMPORT_REVIEW_BUSINESS_KEYWORDS = [
  "Trading",
  "Enterprises",
  "Solar",
  "Engineering",
  "PVT",
  "LTD",
  "Brothers",
  "Traders",
  "Industries",
  "Co.",
  "Corp",
] as const;

function hasImportedReviewBusinessPattern(t: string): boolean {
  const lower = t.toLowerCase();
  return IMPORT_REVIEW_BUSINESS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Today's imported leads: invalid = junk / username-style names.
 * Valid = (has a space for first+last OR matches a business keyword), not ~, no trailing digits.
 */
function isInvalidImportedLeadName(name: string | null | undefined): boolean {
  const t = typeof name === "string" ? name.trim() : "";
  if (t.length < 3) return true;
  if (t.startsWith("~")) return true;
  if (/\d$/.test(t)) return true;
  if (/^\+?[\d\s\-()]+$/u.test(t)) return true;
  if (/^\d+$/u.test(t)) return true;
  if (/^[a-z0-9]+$/i.test(t) && !hasImportedReviewBusinessPattern(t)) return true;

  const hasSpace = /\s/.test(t);
  if (hasSpace || hasImportedReviewBusinessPattern(t)) return false;
  return true;
}

const SMART_DELETE_SOURCE_OPTIONS: { label: string; value: SmartDeleteSource }[] = [
  { label: "All Sources", value: "all" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Instagram", value: "instagram" },
  { label: "Facebook", value: "facebook" },
  { label: "Manual", value: "manual" },
  { label: "Referral", value: "referral" },
  { label: "Other", value: "other" },
];

const SMART_DELETE_STAGE_OPTIONS: { label: string; value: SmartDeleteStage }[] = [
  { label: "All Stages", value: "all" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Qualified", value: "qualified" },
  { label: "Closed", value: "closed" },
];

const SMART_DELETE_PRIORITY_OPTIONS: { label: string; value: SmartDeletePriority }[] = [
  { label: "All Priorities", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const WEB_DATE_INPUT_STYLE: CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.cardSoft,
  color: colors.text,
  fontSize: 16,
  fontFamily: "system-ui, sans-serif",
  accentColor: colors.primary,
  boxSizing: "border-box",
};

function extrasCountWithPrimary(
  clusters: SettingsDuplicateCluster[],
  primaryPick: Record<string, string>,
): number {
  const extras = new Set<string>();
  for (const c of clusters) {
    const pid = primaryPick[c.id] ?? defaultPrimaryId(c);
    for (const l of c.leads) {
      if (l.id !== pid) extras.add(l.id);
    }
  }
  return extras.size;
}

type Props = MainTabScreenProps<"Settings">;

const APP_PREF_PRIORITY_OPTIONS: { label: string; value: DefaultLeadPriority }[] = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

export function SettingsScreen({ }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
  const prefsHydrated = useAppPreferencesStore((s) => s.hydrated);
  const commitPrefs = useAppPreferencesStore((s) => s.commit);
  const [prefPriority, setPrefPriority] = useState<DefaultLeadPriority>("medium");
  const [prefWaCode, setPrefWaCode] = useState("");
  const [prefTimeZone, setPrefTimeZone] = useState("Asia/Karachi");
  const [prefPriorityModalOpen, setPrefPriorityModalOpen] = useState(false);
  const [prefTzModalOpen, setPrefTzModalOpen] = useState(false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [permStatus, setPermStatus] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);

  const [dmLoading, setDmLoading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [suspiciousLeads, setSuspiciousLeads] = useState<DataMgmtLeadRow[]>([]);
  const [todayImportValidLeads, setTodayImportValidLeads] = useState<DataMgmtLeadRow[]>([]);
  const [todayImportInvalidLeads, setTodayImportInvalidLeads] = useState<DataMgmtLeadRow[]>([]);
  const [deletingInvalidImported, setDeletingInvalidImported] = useState(false);
  const [duplicateClusters, setDuplicateClusters] = useState<SettingsDuplicateCluster[]>([]);
  /** Which lead id to keep per duplicate cluster (defaults to oldest). */
  const [primaryPick, setPrimaryPick] = useState<Record<string, string>>({});
  const [fixingTildeNames, setFixingTildeNames] = useState(false);

  const [sdExpanded, setSdExpanded] = useState(false);
  const [sdFromYmd, setSdFromYmd] = useState(() => ymdLocalFromDate(new Date()));
  const [sdToYmd, setSdToYmd] = useState(() => ymdLocalFromDate(new Date()));
  const [sdSource, setSdSource] = useState<SmartDeleteSource>("all");
  const [sdStage, setSdStage] = useState<SmartDeleteStage>("all");
  const [sdPriority, setSdPriority] = useState<SmartDeletePriority>("all");
  const [sdNameContains, setSdNameContains] = useState("");
  const [sdPreviewCount, setSdPreviewCount] = useState<number | null>(null);
  const [sdPreviewNames, setSdPreviewNames] = useState<string[]>([]);
  const [sdPreviewBusy, setSdPreviewBusy] = useState(false);
  const [sdDeleteBusy, setSdDeleteBusy] = useState(false);
  const [sdDeleteProgress, setSdDeleteProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [sdPickerModal, setSdPickerModal] = useState<null | "source" | "stage" | "priority">(null);
  const [sdDatePicker, setSdDatePicker] = useState<null | "from" | "to">(null);

  const isPhysical = Device.isDevice;

  const smartDeleteFilters = useMemo<SmartDeleteFilters>(
    () => ({
      fromYmd: sdFromYmd,
      toYmd: sdToYmd,
      source: sdSource,
      stage: sdStage,
      priority: sdPriority,
      nameContains: sdNameContains,
    }),
    [sdFromYmd, sdToYmd, sdSource, sdStage, sdPriority, sdNameContains],
  );

  const refreshPermission = useCallback(async () => {
    if (!isPhysical) {
      setPermStatus("unavailable");
      return;
    }
    const s = await getNotificationPermissionStatus();
    setPermStatus(s);
  }, [isPhysical]);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    if (!prefsHydrated) return;
    const p = useAppPreferencesStore.getState();
    setPrefPriority(p.defaultLeadPriority);
    setPrefWaCode(p.whatsAppCountryCode);
    setPrefTimeZone(p.timeZone);
  }, [prefsHydrated]);

  const dailyDigestNotifications = useAppPreferencesStore((s) => s.dailyDigestNotifications);

  const onToggleDailyDigest = useCallback(
    async (enabled: boolean) => {
      try {
        const cur = useAppPreferencesStore.getState();
        await commitPrefs(
          mergeAppPreferences({
            defaultLeadPriority: cur.defaultLeadPriority,
            whatsAppCountryCode: cur.whatsAppCountryCode,
            timeZone: cur.timeZone,
            dailyDigestNotifications: enabled,
          }),
        );
        if (enabled) {
          await refreshDailyDigestSchedule();
        } else {
          await cancelAllNotifications();
        }
        showToast(enabled ? "Daily digest notifications on" : "Daily digest notifications off", "success");
        bumpLeadsDataRevision();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not update notification preference.", "error");
      }
    },
    [commitPrefs, showToast, bumpLeadsDataRevision],
  );

  const onTestDailyDigest = useCallback(async () => {
    try {
      await sendImmediateDigest();
      showToast("Test digest will appear in a few seconds.", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send test notification.", "error");
    }
  }, [showToast]);

  const onSaveAppPreferences = useCallback(async () => {
    if (prefSaving) return;
    setPrefSaving(true);
    try {
      await commitPrefs(
        mergeAppPreferences({
          defaultLeadPriority: prefPriority,
          whatsAppCountryCode: prefWaCode.trim(),
          timeZone: prefTimeZone,
          dailyDigestNotifications: useAppPreferencesStore.getState().dailyDigestNotifications,
        }),
      );
      showToast("Preferences saved", "success");
      bumpLeadsDataRevision();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save preferences.", "error");
    } finally {
      setPrefSaving(false);
    }
  }, [prefSaving, prefPriority, prefWaCode, prefTimeZone, commitPrefs, showToast, bumpLeadsDataRevision]);

  const prefPriorityLabel =
    APP_PREF_PRIORITY_OPTIONS.find((o) => o.value === prefPriority)?.label ?? "Medium";
  const prefTimeZoneLabel =
    TIMEZONE_OPTIONS.find((o) => o.id === prefTimeZone)?.label ?? prefTimeZone;

  const loadDataManagement = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setSuspiciousLeads([]);
      setTodayImportValidLeads([]);
      setTodayImportInvalidLeads([]);
      setDuplicateClusters([]);
      setPrimaryPick({});
      return;
    }
    setDmLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone,city,status,created_at")
        .order("created_at", { ascending: false })
        .limit(25_000);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as DataMgmtLeadRow[];
      setSuspiciousLeads(rows.filter((r) => isSuspiciousLeadName(r.name)));
      const now = new Date();
      const createdToday = rows.filter((r) => {
        if (!r.created_at) return false;
        const d = new Date(r.created_at);
        if (Number.isNaN(d.getTime())) return false;
        return isSameLocalDay(d, now);
      });
      setTodayImportInvalidLeads(createdToday.filter((r) => isInvalidImportedLeadName(r.name)));
      setTodayImportValidLeads(createdToday.filter((r) => !isInvalidImportedLeadName(r.name)));
      setDuplicateClusters(buildPhoneDuplicateClusters(rows));
      setPrimaryPick({});
    } catch {
      setSuspiciousLeads([]);
      setTodayImportValidLeads([]);
      setTodayImportInvalidLeads([]);
      setDuplicateClusters([]);
      setPrimaryPick({});
    } finally {
      setDmLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDataManagement();
    }, [loadDataManagement]),
  );

  const handleFixImportedTildeNames = useCallback(async () => {
    if (!user?.id || fixingTildeNames) return;
    if (!isSupabaseConfigured()) {
      showToast("Supabase is not configured.", "error");
      return;
    }
    setFixingTildeNames(true);
    try {
      const supabase = getSupabaseClient();
      const { data: tildeLeads, error } = await supabase.from("leads").select("id,name").like("name", "~%");
      if (error) throw new Error(error.message);
      const rows = (tildeLeads ?? []) as { id: string; name: string | null }[];
      if (rows.length === 0) {
        showToast("No leads with names starting with ~.", "info");
        return;
      }
      for (const lead of rows) {
        const raw = typeof lead.name === "string" ? lead.name : "";
        const next = cleanName(raw);
        if (!next) continue;
        const { error: upErr } = await supabase.from("leads").update({ name: next }).eq("id", lead.id);
        if (upErr) throw new Error(upErr.message);
      }
      showToast(`Fixed ${rows.length} lead names`, "success");
      bumpLeadsDataRevision();
      await loadDataManagement();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not fix names.", "error");
    } finally {
      setFixingTildeNames(false);
    }
  }, [user?.id, fixingTildeNames, showToast, bumpLeadsDataRevision, loadDataManagement]);

  const confirmDeleteLead = useCallback(
    (lead: DataMgmtLeadRow | InboxLeadRow, onDone?: () => void) => {
      const label = deleteConfirmLabel(lead);
      crossPlatformConfirm("Delete lead", `Delete ${label}? This cannot be undone.`, () => {
        void (async () => {
          try {
            const supabase = getSupabaseClient();
            await deleteLeadWithUndoToast(supabase, lead.id, showToast, async () => {
              bumpLeadsDataRevision();
              await loadDataManagement();
              onDone?.();
            });
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Could not delete lead.", "error");
          }
        })();
      });
    },
    [bumpLeadsDataRevision, loadDataManagement, showToast],
  );

  const handleDeleteLead = useCallback(
    async (leadId: string) => {
      const id = typeof leadId === "string" ? leadId.trim() : String(leadId ?? "").trim();
      if (!id) return;
      if (!isSupabaseConfigured()) return;
      try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.from("leads").delete().eq("id", id);
        if (error) throw error;
        setSuspiciousLeads((prev) => prev.filter((l) => l.id !== id));
        bumpLeadsDataRevision();
        showToast("Lead deleted", "success");
      } catch (e) {
        console.error("Delete error:", e);
        showToast("Could not delete lead. Try again.", "error");
      }
    },
    [bumpLeadsDataRevision, showToast],
  );

  const handleDeleteAll = useCallback(() => {
    if (suspiciousLeads.length === 0 || bulkDeleting) return;
    const n = suspiciousLeads.length;
    const ids = suspiciousLeads.map((l) => l.id).filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (ids.length === 0) return;
    crossPlatformConfirm(
      "Delete All Suspicious",
      `Delete ${n} suspicious leads? This cannot be undone.`,
      () => {
        void (async () => {
          if (!isSupabaseConfigured()) return;
          setBulkDeleting(true);
          try {
            const supabase = getSupabaseClient();
            const chunkSize = 150;
            for (let i = 0; i < ids.length; i += chunkSize) {
              const slice = ids.slice(i, i + chunkSize);
              const { error } = await supabase.from("leads").delete().in("id", slice);
              if (error) {
                showToast("Could not delete leads.", "error");
                return;
              }
            }
            setSuspiciousLeads([]);
            bumpLeadsDataRevision();
            showToast(`${ids.length} leads deleted`, "success");
          } catch (e) {
            console.error("Delete all error:", e);
            showToast("Could not delete leads.", "error");
          } finally {
            setBulkDeleting(false);
          }
        })();
      },
      "Delete All",
    );
  }, [suspiciousLeads, bulkDeleting, bumpLeadsDataRevision, showToast]);

  const deleteAllInvalidImportedToday = useCallback(() => {
    if (todayImportInvalidLeads.length === 0 || deletingInvalidImported) return;
    const ids = todayImportInvalidLeads
      .map((l) => l.id)
      .filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (ids.length === 0) return;
    crossPlatformConfirm(
      "Delete all invalid imported leads",
      `Delete ${ids.length} invalid leads from today? This cannot be undone.`,
      () => {
        void (async () => {
          if (!isSupabaseConfigured()) return;
          setDeletingInvalidImported(true);
          try {
            const supabase = getSupabaseClient();
            const chunkSize = 150;
            for (let i = 0; i < ids.length; i += chunkSize) {
              const slice = ids.slice(i, i + chunkSize);
              const { error } = await supabase.from("leads").delete().in("id", slice);
              if (error) throw error;
            }
            showToast(`${ids.length} invalid leads deleted`, "success");
            bumpLeadsDataRevision();
            await loadDataManagement();
          } catch {
            showToast("Could not delete invalid imported leads.", "error");
          } finally {
            setDeletingInvalidImported(false);
          }
        })();
      },
      "Delete all invalid",
    );
  }, [
    todayImportInvalidLeads,
    deletingInvalidImported,
    showToast,
    bumpLeadsDataRevision,
    loadDataManagement,
  ]);

  const keepAllValidImportedToday = useCallback(() => {
    const n = todayImportValidLeads.length;
    if (n === 0) {
      showToast("No valid imported leads found for today.", "info");
      return;
    }
    showToast(`${n} valid leads kept`, "success");
  }, [todayImportValidLeads.length, showToast]);

  const [iosPickerDate, setIosPickerDate] = useState(() => new Date());

  useEffect(() => {
    if (sdDatePicker === "from") setIosPickerDate(parseYmdLocalStart(sdFromYmd));
    else if (sdDatePicker === "to") setIosPickerDate(parseYmdLocalStart(sdToYmd));
  }, [sdDatePicker, sdFromYmd, sdToYmd]);

  useEffect(() => {
    setSdPreviewCount(null);
    setSdPreviewNames([]);
  }, [sdFromYmd, sdToYmd, sdSource, sdStage, sdPriority, sdNameContains]);

  const handleSmartDeletePreview = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      showToast("Supabase is not configured.", "error");
      return;
    }
    if (!isValidYmdRange(sdFromYmd, sdToYmd)) {
      showToast("From date must be before or equal to To date.", "error");
      return;
    }
    setSdPreviewBusy(true);
    try {
      const supabase = getSupabaseClient();
      let qc = supabase.from("leads").select("*", { count: "exact", head: true });
      qc = applySmartDeleteFilters(qc, smartDeleteFilters);
      const { count, error: cErr } = await qc;
      if (cErr) throw new Error(cErr.message);
      const n = count ?? 0;

      let qn = supabase.from("leads").select("name").order("created_at", { ascending: false }).limit(10);
      qn = applySmartDeleteFilters(qn, smartDeleteFilters);
      const { data: rows, error: nErr } = await qn;
      if (nErr) throw new Error(nErr.message);
      const names = (rows ?? []).map((r: { name: string | null }) =>
        typeof r.name === "string" && r.name.trim() ? r.name.trim() : "(unnamed)",
      );
      setSdPreviewCount(n);
      setSdPreviewNames(names);
      if (n === 0) {
        showToast("No leads match these filters", "info");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Preview failed.", "error");
      setSdPreviewCount(null);
      setSdPreviewNames([]);
    } finally {
      setSdPreviewBusy(false);
    }
  }, [smartDeleteFilters, showToast, sdFromYmd, sdToYmd]);

  const performSmartDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setSdDeleteBusy(true);
      setSdDeleteProgress({ current: 0, total: ids.length });
      try {
        const supabase = getSupabaseClient();
        let deleted = 0;
        const chunk = 100;
        for (let i = 0; i < ids.length; i += chunk) {
          const slice = ids.slice(i, i + chunk);
          const { error } = await supabase.from("leads").delete().in("id", slice);
          if (error) throw error;
          deleted += slice.length;
          setSdDeleteProgress({ current: deleted, total: ids.length });
        }
        showToast(`${ids.length} leads deleted`, "success");
        bumpLeadsDataRevision();
        setSdPreviewCount(0);
        setSdPreviewNames([]);
        await loadDataManagement();
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Delete failed.", "error");
      } finally {
        setSdDeleteProgress(null);
        setSdDeleteBusy(false);
      }
    },
    [bumpLeadsDataRevision, loadDataManagement, showToast],
  );

  const handleSmartDeletePress = useCallback(() => {
    void (async () => {
      if (!isSupabaseConfigured()) {
        showToast("Supabase is not configured.", "error");
        return;
      }
      if (!isValidYmdRange(sdFromYmd, sdToYmd)) {
        showToast("From date must be before or equal to To date.", "error");
        return;
      }
      setSdDeleteBusy(true);
      try {
        const ids = await fetchAllMatchingLeadIds(getSupabaseClient(), smartDeleteFilters);
        if (ids.length === 0) {
          showToast("No leads match these filters.", "info");
          return;
        }
        setSdDeleteBusy(false);
        crossPlatformConfirm(
          "Delete matching leads",
          `Delete ${ids.length} leads? This cannot be undone.`,
          () => {
            void performSmartDelete(ids);
          },
          "Delete",
        );
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load matching leads.", "error");
      } finally {
        setSdDeleteBusy(false);
      }
    })();
  }, [smartDeleteFilters, showToast, sdFromYmd, sdToYmd, performSmartDelete]);

  const dupExtras = extrasCountWithPrimary(duplicateClusters, primaryPick);

  const onRegisterPush = useCallback(async () => {
    setRegisterMessage(null);
    if (api.demoMode) {
      setRegisterMessage("Disabled in demo mode (set EXPO_PUBLIC_DEMO_MODE=false).");
      return;
    }
    setRegistering(true);
    try {
      const token = await registerExpoPushToken();
      await refreshPermission();
      if (!token) {
        setRegisterMessage("No token — check notification permission.");
        return;
      }
      const label = [Device.brand, Device.modelName].filter(Boolean).join(" ") || undefined;
      await api.registerPushToken(token, label);
      setRegisterMessage("Push token registered with the API.");
    } catch (e) {
      setRegisterMessage(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setRegistering(false);
    }
  }, [refreshPermission]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Account and device</Text>

      <Card style={styles.prefCard}>
        <Text style={styles.section}>App Preferences</Text>
        <Text style={styles.prefHint}>
          Defaults for new leads, WhatsApp links, and calendar day boundaries (New Today & follow-ups).
        </Text>

        <Text style={styles.dmSubheading}>Default priority</Text>
        <Pressable
          style={[styles.prefSelect, !prefsHydrated && styles.prefSelectDisabled]}
          onPress={() => prefsHydrated && setPrefPriorityModalOpen(true)}
          disabled={!prefsHydrated}
          accessibilityRole="button"
          accessibilityLabel="Default priority for new leads"
        >
          <Text style={styles.prefSelectText}>{prefPriorityLabel}</Text>
          <Text style={styles.prefChevron}>▾</Text>
        </Pressable>

        <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Default WhatsApp country code</Text>
        <Text style={styles.prefFieldHint}>Prefix for national numbers (e.g. +92 for Pakistan). Leave empty if numbers are already international.</Text>
        <TextInput
          style={styles.prefInput}
          value={prefWaCode}
          onChangeText={setPrefWaCode}
          placeholder="+92"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="phone-pad"
          editable={prefsHydrated}
        />

        <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Timezone</Text>
        <Text style={styles.prefFieldHint}>Default: Asia/Karachi (UTC+5). Used for New Today and follow-up day grouping.</Text>
        <Pressable
          style={[styles.prefSelect, !prefsHydrated && styles.prefSelectDisabled]}
          onPress={() => prefsHydrated && setPrefTzModalOpen(true)}
          disabled={!prefsHydrated}
          accessibilityRole="button"
          accessibilityLabel="Timezone"
        >
          <Text style={styles.prefSelectText} numberOfLines={2}>
            {prefTimeZoneLabel}
          </Text>
          <Text style={styles.prefChevron}>▾</Text>
        </Pressable>

        <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Daily digest notifications</Text>
        <Text style={styles.prefFieldHint}>
          Local reminder at 9:00 (device time) with follow-ups, hot leads, and pipeline summary. Requires
          notification permission.
        </Text>
        <View style={styles.digestToggleRow}>
          <Text style={styles.digestToggleLabel}>Daily digest</Text>
          <Switch
            value={dailyDigestNotifications}
            onValueChange={(v) => void onToggleDailyDigest(v)}
            disabled={!prefsHydrated}
            trackColor={{ false: colors.border, true: `${colors.primary}88` }}
            thumbColor={dailyDigestNotifications ? colors.primary : colors.textMuted}
          />
        </View>
        {Platform.OS !== "web" ? (
          <Pressable
            style={({ pressed }) => [styles.digestTestBtn, pressed && styles.pressed]}
            onPress={() => void onTestDailyDigest()}
            accessibilityRole="button"
            accessibilityLabel="Send test digest notification"
          >
            <Text style={styles.digestTestBtnText}>Send test digest (now)</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.prefSaveBtn,
            (pressed || prefSaving || !prefsHydrated) && styles.pressed,
            (!prefsHydrated || prefSaving) && styles.prefSaveBtnDisabled,
          ]}
          onPress={() => void onSaveAppPreferences()}
          disabled={!prefsHydrated || prefSaving}
          accessibilityRole="button"
          accessibilityLabel="Save app preferences"
        >
          {prefSaving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.prefSaveBtnText}>Save preferences</Text>
          )}
        </Pressable>
      </Card>

      <Modal
        visible={prefPriorityModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPrefPriorityModalOpen(false)}
      >
        <Pressable style={styles.prefModalBackdrop} onPress={() => setPrefPriorityModalOpen(false)}>
          <Pressable style={styles.prefModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.prefModalTitle}>Default priority</Text>
            {APP_PREF_PRIORITY_OPTIONS.map((opt) => {
              const selected = prefPriority === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.prefModalRow, selected && styles.prefModalRowSelected]}
                  onPress={() => {
                    setPrefPriority(opt.value);
                    setPrefPriorityModalOpen(false);
                  }}
                >
                  <Text style={[styles.prefModalRowText, selected && styles.prefModalRowTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.prefModalClose} onPress={() => setPrefPriorityModalOpen(false)}>
              <Text style={styles.prefModalCloseText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={prefTzModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPrefTzModalOpen(false)}
      >
        <Pressable style={styles.prefModalBackdrop} onPress={() => setPrefTzModalOpen(false)}>
          <Pressable style={styles.prefModalCardScroll} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.prefModalTitle}>Timezone</Text>
            <ScrollView style={styles.prefTzScroll} keyboardShouldPersistTaps="handled">
              {TIMEZONE_OPTIONS.map((opt) => {
                const selected = prefTimeZone === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[styles.prefModalRow, selected && styles.prefModalRowSelected]}
                    onPress={() => {
                      setPrefTimeZone(opt.id);
                      setPrefTzModalOpen(false);
                    }}
                  >
                    <Text style={[styles.prefModalRowText, selected && styles.prefModalRowTextSelected]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.prefModalClose} onPress={() => setPrefTzModalOpen(false)}>
              <Text style={styles.prefModalCloseText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {isSupabaseConfigured() ? (
        <Card style={styles.dmCard}>
          <Text style={styles.section}>Data Management</Text>

          <Text style={styles.dmSubheading}>Imported name cleanup</Text>
          <Text style={styles.dmHintSmall}>
            Strip a leading ~ from lead names (matches WhatsApp group export display format).
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.fixTildeNamesBtn,
              (pressed || fixingTildeNames) && styles.pressed,
              fixingTildeNames && styles.cleanAllBtnDisabled,
            ]}
            onPress={() => void handleFixImportedTildeNames()}
            disabled={fixingTildeNames}
            accessibilityRole="button"
            accessibilityLabel="Fix tilde names"
          >
            {fixingTildeNames ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.fixTildeNamesBtnText}>Fix ~ names</Text>
            )}
          </Pressable>

          <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Suspicious leads</Text>
          <Text style={styles.dmHint}>
            Names under 3 characters, or exactly: xyz, my, test, aaa, 123, abc (case-insensitive).
          </Text>
          {!dmLoading && suspiciousLeads.length > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.deleteAllSuspiciousTopBtn,
                (pressed || bulkDeleting) && styles.pressed,
                bulkDeleting && styles.cleanAllBtnDisabled,
              ]}
              onPress={handleDeleteAll}
              disabled={bulkDeleting}
              accessibilityRole="button"
              accessibilityLabel="Delete all suspicious leads"
            >
              {bulkDeleting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.deleteAllSuspiciousTopBtnText}>Delete all suspicious</Text>
              )}
            </Pressable>
          ) : null}
          {dmLoading ? (
            <View style={styles.dmLoadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.rowMuted}>Loading…</Text>
            </View>
          ) : suspiciousLeads.length === 0 ? (
            <Text style={styles.dmEmpty}>No suspicious leads detected.</Text>
          ) : (
            suspiciousLeads.map((lead, index) => (
              <View key={lead.id} style={[styles.dmRow, index > 0 && styles.dmRowSep]}>
                <View style={styles.dmRowText}>
                  <Text style={styles.dmName} numberOfLines={1}>
                    {leadDisplayName(lead.name)}
                  </Text>
                  <Text style={styles.dmMeta} numberOfLines={1}>
                    Stage: {formatLeadStageLabel(lead.status)}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.dmDeleteBtn, pressed && styles.pressed]}
                  onPress={() => {
                    const id = typeof lead.id === "string" ? lead.id.trim() : String(lead.id ?? "").trim();
                    if (!id) return;
                    crossPlatformConfirm(
                      "Delete lead",
                      `Delete ${deleteConfirmLabel(lead)}? This cannot be undone.`,
                      () => void handleDeleteLead(id),
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete lead ${deleteConfirmLabel(lead)}`}
                >
                  <Text style={styles.dmDeleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Imported leads review</Text>
          <Text style={styles.dmHintSmall}>All leads created today, split into valid and invalid names.</Text>
          {dmLoading ? null : (
            <Text style={styles.dupCountLine}>
              {todayImportValidLeads.length} valid, {todayImportInvalidLeads.length} invalid leads from today's import
            </Text>
          )}
          {!dmLoading ? (
            <View style={styles.importedReviewActionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.importedDeleteInvalidBtn,
                  (pressed || deletingInvalidImported || todayImportInvalidLeads.length === 0) && styles.pressed,
                  (deletingInvalidImported || todayImportInvalidLeads.length === 0) && styles.cleanAllBtnDisabled,
                ]}
                onPress={deleteAllInvalidImportedToday}
                disabled={deletingInvalidImported || todayImportInvalidLeads.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Delete all invalid imported leads"
              >
                {deletingInvalidImported ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.importedDeleteInvalidBtnText}>Delete all invalid</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.importedKeepValidBtn,
                  (pressed || todayImportValidLeads.length === 0) && styles.pressed,
                  todayImportValidLeads.length === 0 && styles.cleanAllBtnDisabled,
                ]}
                onPress={keepAllValidImportedToday}
                disabled={todayImportValidLeads.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Keep all valid imported leads"
              >
                <Text style={styles.importedKeepValidBtnText}>Keep all valid</Text>
              </Pressable>
            </View>
          ) : null}
          {!dmLoading && todayImportInvalidLeads.length > 0 ? (
            <View style={styles.importedReviewListBlock}>
              <Text style={styles.importedReviewListTitle}>Invalid</Text>
              {todayImportInvalidLeads.map((lead, idx) => (
                <Text key={`inv-${lead.id}`} style={[styles.importedReviewListRow, idx > 0 && styles.dmRowSep]} numberOfLines={1}>
                  {leadDisplayName(lead.name)}
                </Text>
              ))}
            </View>
          ) : null}
          {!dmLoading && todayImportValidLeads.length > 0 ? (
            <View style={styles.importedReviewListBlock}>
              <Text style={styles.importedReviewListTitle}>Valid</Text>
              {todayImportValidLeads.map((lead, idx) => (
                <Text key={`val-${lead.id}`} style={[styles.importedReviewListRow, idx > 0 && styles.dmRowSep]} numberOfLines={1}>
                  {leadDisplayName(lead.name)}
                </Text>
              ))}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.sdCollapsibleHeader, pressed && styles.pressed]}
            onPress={() => setSdExpanded((e) => !e)}
            accessibilityRole="button"
            accessibilityLabel={sdExpanded ? "Collapse Smart Delete" : "Expand Smart Delete"}
          >
            <Text style={styles.sdCollapsibleHeaderText}>
              {sdExpanded ? "▼" : "▶"} Smart Delete
            </Text>
          </Pressable>
          {sdExpanded ? (
            <View style={styles.sdPanel}>
              <Text style={styles.sdWarningHint}>
                Bulk delete with filters. Preview first, then delete. This cannot be undone.
              </Text>

              <Text style={styles.sdFilterLabel}>Date range</Text>
              <View style={styles.sdDateRow}>
                <View style={styles.sdDateCol}>
                  <Text style={styles.sdFieldLabel}>From date</Text>
                  {Platform.OS === "web" ? (
                    createElement("input", {
                      type: "date",
                      value: sdFromYmd,
                      onChange: (e: { target: { value: string } }) => setSdFromYmd(e.target.value),
                      style: WEB_DATE_INPUT_STYLE,
                    })
                  ) : (
                    <Pressable
                      style={styles.prefSelect}
                      onPress={() => setSdDatePicker("from")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.prefSelectText}>{sdFromYmd}</Text>
                      <Text style={styles.prefChevron}>▾</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.sdDateCol}>
                  <Text style={styles.sdFieldLabel}>To date</Text>
                  {Platform.OS === "web" ? (
                    createElement("input", {
                      type: "date",
                      value: sdToYmd,
                      onChange: (e: { target: { value: string } }) => setSdToYmd(e.target.value),
                      style: WEB_DATE_INPUT_STYLE,
                    })
                  ) : (
                    <Pressable
                      style={styles.prefSelect}
                      onPress={() => setSdDatePicker("to")}
                      accessibilityRole="button"
                    >
                      <Text style={styles.prefSelectText}>{sdToYmd}</Text>
                      <Text style={styles.prefChevron}>▾</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <Text style={[styles.sdFilterLabel, styles.sdFilterLabelSpaced]}>Source</Text>
              <Pressable
                style={styles.prefSelect}
                onPress={() => setSdPickerModal("source")}
                accessibilityRole="button"
              >
                <Text style={styles.prefSelectText}>
                  {SMART_DELETE_SOURCE_OPTIONS.find((o) => o.value === sdSource)?.label ?? "All Sources"}
                </Text>
                <Text style={styles.prefChevron}>▾</Text>
              </Pressable>

              <Text style={[styles.sdFilterLabel, styles.sdFilterLabelSpaced]}>Stage</Text>
              <Pressable
                style={styles.prefSelect}
                onPress={() => setSdPickerModal("stage")}
                accessibilityRole="button"
              >
                <Text style={styles.prefSelectText}>
                  {SMART_DELETE_STAGE_OPTIONS.find((o) => o.value === sdStage)?.label ?? "All Stages"}
                </Text>
                <Text style={styles.prefChevron}>▾</Text>
              </Pressable>

              <Text style={[styles.sdFilterLabel, styles.sdFilterLabelSpaced]}>Priority</Text>
              <Pressable
                style={styles.prefSelect}
                onPress={() => setSdPickerModal("priority")}
                accessibilityRole="button"
              >
                <Text style={styles.prefSelectText}>
                  {SMART_DELETE_PRIORITY_OPTIONS.find((o) => o.value === sdPriority)?.label ?? "All Priorities"}
                </Text>
                <Text style={styles.prefChevron}>▾</Text>
              </Pressable>

              <Text style={[styles.sdFilterLabel, styles.sdFilterLabelSpaced]}>Name pattern</Text>
              <TextInput
                style={styles.prefInput}
                value={sdNameContains}
                onChangeText={setSdNameContains}
                placeholder="Name contains…"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                style={({ pressed }) => [
                  styles.sdPreviewBtn,
                  (pressed || sdPreviewBusy) && styles.pressed,
                  sdPreviewBusy && styles.cleanAllBtnDisabled,
                ]}
                onPress={() => void handleSmartDeletePreview()}
                disabled={sdPreviewBusy}
                accessibilityRole="button"
              >
                {sdPreviewBusy ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.sdPreviewBtnText}>Preview matches</Text>
                )}
              </Pressable>

              {sdPreviewCount !== null ? (
                <Text style={styles.sdPreviewCountLine}>
                  {sdPreviewCount === 0
                    ? "No leads match these filters"
                    : `${sdPreviewCount} leads match these filters`}
                </Text>
              ) : null}
              {sdPreviewNames.length > 0 ? (
                <View style={styles.sdPreviewList}>
                  {sdPreviewNames.map((n, i) => (
                    <Text key={`sd-prev-${i}`} style={styles.sdPreviewRow} numberOfLines={1}>
                      {n}
                    </Text>
                  ))}
                </View>
              ) : null}

              {sdDeleteProgress ? (
                <Text style={styles.sdProgressText}>
                  Deleting… {sdDeleteProgress.current}/{sdDeleteProgress.total}
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.sdDeleteBtn,
                  (pressed || sdDeleteBusy) && styles.pressed,
                  (sdDeleteBusy || (sdPreviewCount !== null && sdPreviewCount === 0)) && styles.cleanAllBtnDisabled,
                ]}
                onPress={handleSmartDeletePress}
                disabled={sdDeleteBusy || (sdPreviewCount !== null && sdPreviewCount === 0)}
                accessibilityRole="button"
              >
                {sdDeleteBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sdDeleteBtnText}>
                    {sdPreviewCount !== null
                      ? `Delete ${sdPreviewCount} matching leads`
                      : "Delete matching leads"}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {sdDatePicker !== null && Platform.OS === "android" ? (
            <DateTimePicker
              value={sdDatePicker === "from" ? parseYmdLocalStart(sdFromYmd) : parseYmdLocalStart(sdToYmd)}
              mode="date"
              display="default"
              onChange={(event, date) => {
                if (event.type === "dismissed") {
                  setSdDatePicker(null);
                  return;
                }
                setSdDatePicker(null);
                if (date && event.type === "set") {
                  if (sdDatePicker === "from") setSdFromYmd(ymdLocalFromDate(date));
                  else setSdToYmd(ymdLocalFromDate(date));
                }
              }}
            />
          ) : null}

          {sdDatePicker !== null && Platform.OS === "ios" ? (
            <Modal visible transparent animationType="fade" onRequestClose={() => setSdDatePicker(null)}>
              <Pressable style={styles.prefModalBackdrop} onPress={() => setSdDatePicker(null)}>
                <Pressable style={styles.prefModalCard} onPress={(e) => e.stopPropagation()}>
                  <Text style={styles.prefModalTitle}>{sdDatePicker === "from" ? "From date" : "To date"}</Text>
                  <DateTimePicker
                    value={iosPickerDate}
                    mode="date"
                    display="spinner"
                    onChange={(_, d) => {
                      if (d) setIosPickerDate(d);
                    }}
                  />
                  <Pressable
                    style={styles.sdIosDoneBtn}
                    onPress={() => {
                      if (sdDatePicker === "from") setSdFromYmd(ymdLocalFromDate(iosPickerDate));
                      else setSdToYmd(ymdLocalFromDate(iosPickerDate));
                      setSdDatePicker(null);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.sdIosDoneBtnText}>Done</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          ) : null}

          {sdPickerModal !== null ? (
            <Modal visible transparent animationType="fade" onRequestClose={() => setSdPickerModal(null)}>
              <Pressable style={styles.prefModalBackdrop} onPress={() => setSdPickerModal(null)}>
                <Pressable style={styles.prefModalCardScroll} onPress={(e) => e.stopPropagation()}>
                  <Text style={styles.prefModalTitle}>
                    {sdPickerModal === "source"
                      ? "Source"
                      : sdPickerModal === "stage"
                        ? "Stage"
                        : "Priority"}
                  </Text>
                  <ScrollView style={styles.prefTzScroll} keyboardShouldPersistTaps="handled">
                    {(sdPickerModal === "source"
                      ? SMART_DELETE_SOURCE_OPTIONS
                      : sdPickerModal === "stage"
                        ? SMART_DELETE_STAGE_OPTIONS
                        : SMART_DELETE_PRIORITY_OPTIONS
                    ).map((opt) => {
                      const selected =
                        sdPickerModal === "source"
                          ? sdSource === opt.value
                          : sdPickerModal === "stage"
                            ? sdStage === opt.value
                            : sdPriority === opt.value;
                      return (
                        <Pressable
                          key={`${sdPickerModal}-${opt.value}`}
                          style={[styles.prefModalRow, selected && styles.prefModalRowSelected]}
                          onPress={() => {
                            if (sdPickerModal === "source") setSdSource(opt.value as SmartDeleteSource);
                            else if (sdPickerModal === "stage") setSdStage(opt.value as SmartDeleteStage);
                            else setSdPriority(opt.value as SmartDeletePriority);
                            setSdPickerModal(null);
                          }}
                        >
                          <Text style={[styles.prefModalRowText, selected && styles.prefModalRowTextSelected]}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Pressable style={styles.prefModalClose} onPress={() => setSdPickerModal(null)}>
                    <Text style={styles.prefModalCloseText}>Cancel</Text>
                  </Pressable>
                </Pressable>
              </Pressable>
            </Modal>
          ) : null}

          <Text style={[styles.dmSubheading, styles.dmSubheadingSpaced]}>Duplicate leads</Text>
          <Text style={styles.dmHintSmall}>
            Groups of two or more leads with the same phone number. Pick one to keep; delete the rest. After
            resolving, open Pipeline or pull to refresh — stage counts will update.
          </Text>
          {dmLoading ? null : (
            <Text style={styles.dupCountLine}>
              {dupExtras === 0
                ? "No duplicate phone numbers found."
                : `${dupExtras} duplicate entr${dupExtras === 1 ? "y" : "ies"} to resolve`}
            </Text>
          )}
          {!dmLoading && duplicateClusters.length === 0 ? (
            <Text style={styles.dmEmptyMuted}>No two leads share the same phone number.</Text>
          ) : null}
          {!dmLoading &&
            duplicateClusters.map((cluster) => {
              const primaryId = primaryPick[cluster.id] ?? defaultPrimaryId(cluster);
              const ordered = orderClusterLeadsWithPrimary(cluster, primaryId);
              return (
                <View key={cluster.id} style={styles.dupCluster}>
                  <Text style={styles.dupClusterTitle} numberOfLines={3}>
                    {cluster.headline}
                  </Text>
                  {ordered.map((lead, idx) => {
                    const isPrimary = lead.id === primaryId;
                    return (
                      <View
                        key={lead.id}
                        style={[styles.dupRow, idx > 0 && styles.dupRowSep]}
                      >
                        <View style={styles.dupRowMain}>
                          <Text style={styles.dupName} numberOfLines={1}>
                            {leadDisplayName(lead.name)}
                          </Text>
                          <Text style={styles.dupMeta} numberOfLines={1}>
                            {formatLeadStageLabel(lead.status)}
                          </Text>
                        </View>
                        {isPrimary ? (
                          <View style={styles.dupKeepingPill}>
                            <Text style={styles.dupKeepingText}>Keep</Text>
                          </View>
                        ) : (
                          <View style={styles.dupRowActions}>
                            <Pressable
                              style={({ pressed }) => [styles.dupKeepBtn, pressed && styles.pressed]}
                              onPress={() =>
                                setPrimaryPick((p) => ({ ...p, [cluster.id]: lead.id }))
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Keep this lead as primary"
                            >
                              <Text style={styles.dupKeepBtnText}>Keep</Text>
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [styles.dmDeleteBtn, pressed && styles.pressed]}
                              onPress={() => confirmDeleteLead(lead)}
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${deleteConfirmLabel(lead)}`}
                            >
                              <Text style={styles.dmDeleteBtnText}>Delete</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.section}>Profile</Text>
        <Text style={styles.row}>Name: {user?.fullName ?? "—"}</Text>
        <Text style={styles.row}>Role: {user?.role ?? "—"}</Text>
        <Text style={styles.rowMuted}>User id: {user?.id ?? "—"}</Text>
      </Card>

      <Card>
        <Text style={styles.section}>Notifications</Text>
        <Text style={styles.row}>{describePushStatus(permStatus, isPhysical)}</Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          onPress={() => void refreshPermission()}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText}>Refresh permission status</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, (registering || pressed) && styles.pressed]}
          onPress={() => void onRegisterPush()}
          disabled={registering || !isPhysical}
          accessibilityRole="button"
          accessibilityState={{ disabled: registering || !isPhysical }}
        >
          {registering ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.primaryBtnText}>Register for push</Text>
          )}
        </Pressable>
        {registerMessage ? <Text style={styles.hint}>{registerMessage}</Text> : null}
      </Card>

      <Pressable
        style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        onPress={() => void logout()}
        accessibilityRole="button"
      >
        <Text style={styles.dangerBtnText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  prefCard: { marginBottom: 14 },
  prefHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  prefFieldHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  digestToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    paddingVertical: 4,
  },
  digestToggleLabel: { color: colors.text, fontSize: 16, fontWeight: "700", flex: 1 },
  digestTestBtn: {
    alignSelf: "flex-start",
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  digestTestBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  prefSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.cardSoft,
  },
  prefSelectDisabled: { opacity: 0.6 },
  prefSelectText: { color: colors.text, fontSize: 16, fontWeight: "600", flex: 1, marginRight: 8 },
  prefChevron: { color: colors.textMuted, fontSize: 16 },
  prefInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
    backgroundColor: colors.cardSoft,
  },
  prefSaveBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  prefSaveBtnDisabled: { opacity: 0.65 },
  prefSaveBtnText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  prefModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  prefModalCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    maxHeight: "70%",
  },
  prefModalCardScroll: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    maxHeight: "75%",
  },
  prefTzScroll: { maxHeight: 320 },
  prefModalTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prefModalRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  prefModalRowSelected: { backgroundColor: colors.cardSoft },
  prefModalRowText: { color: colors.text, fontSize: 16 },
  prefModalRowTextSelected: { color: colors.primary, fontWeight: "700" },
  prefModalClose: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  prefModalCloseText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, marginBottom: 16, fontSize: 15 },
  section: { color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 10 },
  row: { color: colors.text, fontSize: 15, marginBottom: 8 },
  rowMuted: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  primaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  primaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  dangerBtn: {
    marginTop: 8,
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  dangerBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: { color: colors.textMuted, marginTop: 12, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.85 },
  dmCard: { marginBottom: 14 },
  dmSubheading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  dmSubheadingSpaced: { marginTop: 20 },
  dmHint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  dmHintSmall: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  dmLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  dmEmpty: { color: colors.textMuted, fontSize: 15, marginBottom: 4 },
  dmEmptyMuted: { color: colors.textMuted, fontSize: 14, marginBottom: 10, lineHeight: 20 },
  dupCountLine: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 12 },
  dmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  dmRowSep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dmRowText: { flex: 1, minWidth: 0 },
  dmName: { color: colors.text, fontSize: 15, fontWeight: "700" },
  dmMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  dmDeleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.danger,
  },
  dmDeleteBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  deleteAllSuspiciousTopBtn: {
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    minHeight: 46,
    justifyContent: "center",
  },
  deleteAllSuspiciousTopBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  cleanAllBtnDisabled: { opacity: 0.75 },
  fixTildeNamesBtn: {
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    minHeight: 46,
    justifyContent: "center",
  },
  fixTildeNamesBtnText: { color: colors.text, fontWeight: "800", fontSize: 15 },
  sdCollapsibleHeader: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  sdCollapsibleHeaderText: { color: colors.danger, fontWeight: "800", fontSize: 15 },
  sdPanel: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  sdWarningHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  sdFilterLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  sdFilterLabelSpaced: { marginTop: 12 },
  sdFieldLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  sdDateRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  sdDateCol: { flex: 1, minWidth: 0 },
  sdPreviewBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
    minHeight: 46,
    justifyContent: "center",
  },
  sdPreviewBtnText: { color: colors.text, fontWeight: "800", fontSize: 15 },
  sdPreviewCountLine: {
    marginTop: 12,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  sdPreviewList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sdPreviewRow: { color: colors.text, fontSize: 14, paddingVertical: 6 },
  sdProgressText: { marginTop: 10, color: colors.warning, fontSize: 14, fontWeight: "700" },
  sdDeleteBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  sdDeleteBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  sdIosDoneBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sdIosDoneBtnText: { color: colors.primary, fontWeight: "800", fontSize: 16 },
  importedReviewActionsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  importedDeleteInvalidBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  importedDeleteInvalidBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  importedKeepValidBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  importedKeepValidBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  importedReviewListBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    marginBottom: 10,
  },
  importedReviewListTitle: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  importedReviewListRow: { color: colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
  dupCluster: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dupClusterTitle: { color: colors.primary, fontSize: 13, fontWeight: "700", marginBottom: 10, lineHeight: 18 },
  dupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
  },
  dupRowSep: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dupRowMain: { flex: 1, minWidth: 0 },
  dupName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  dupMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  dupRowActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  dupKeepBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  dupKeepBtnText: { color: colors.primary, fontWeight: "800", fontSize: 13 },
  dupKeepingPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dupKeepingText: { color: colors.success, fontWeight: "800", fontSize: 12 },
});
