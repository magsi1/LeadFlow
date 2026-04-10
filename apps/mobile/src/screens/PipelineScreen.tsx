import { Ionicons } from "@expo/vector-icons";
import type { ChangeEvent, ComponentProps } from "react";
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../context/ToastContext";
import { AddLeadFab } from "../components/AddLeadFab";
import { VoiceToLeadFab } from "../components/VoiceToLeadFab";
import { VoiceToLeadFlow } from "../components/VoiceToLeadFlow";
import { ChatSearchResultsPanel } from "../components/ChatSearchResultsPanel";
import { Card } from "../components/Card";
import { LeadAvatar } from "../components/LeadAvatar";
import { PipelineCardSkeleton } from "../components/PipelineCardSkeleton";
import { LeadCardAiReplyButton } from "../components/LeadCardAiReplyButton";
import { SetFollowUpButton } from "../components/SetFollowUpButton";
import { formatLeadPriorityDisplay } from "../lib/leadPriority";
import { coerceDealValue } from "../lib/dealValue";
import {
  digitsOnlyPhone,
  normalizePhoneForWaMeWithPrefix,
  openWhatsAppForPhone,
} from "../lib/whatsapp";
import { filterValidInboxLeads, isLeadNameMissing, leadDisplayName } from "../lib/safeData";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import {
  buildCsvImportTemplate,
  buildLeadsCsv,
  downloadOrShareCsv,
  fetchAllLeadsForExport,
  leadflowExportFilename,
  leadflowImportTemplateFilename,
} from "../lib/leadExportCsv";
import {
  batchInsertImportedLeads,
  parsePipelineImportCsv,
  PIPELINE_IMPORT_WORKSPACE_ID,
  validateAndNormalizeImportRows,
  type ValidImportRow,
} from "../lib/pipelineCsvImport";
import {
  batchInsertWhatsAppGroupLeads,
  isWhatsAppPhoneOnlyLead,
  parseWhatsAppGroupChatExport,
  type WhatsAppGroupLeadRow,
  type WhatsAppImportStats,
} from "../lib/whatsappChatImport";
import {
  DEFAULT_CHAT_SEARCH_FILTERS,
  groupChatSearchResults,
  searchChatHistory,
  type ChatSearchFilters,
  type GroupedChatSearch,
} from "../lib/chatSearch";
import {
  calculateLeadScore,
  coerceLeadScoreNumber,
  getScoreColor,
  getScoreEmoji,
  inboxLeadToScoreInput,
  leadScoreSortKey,
  sortPipelineLeads,
  type PipelineSortId,
} from "../lib/leadScoring";
import { getRecentChatSearches, saveRecentChatSearch } from "../lib/recentChatSearches";
import { isTestLikeLeadName } from "../lib/testLeadDetection";
import { getSupabaseClient, isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import { openLeadDetailWithAiFocus } from "../navigation/openLeadDetailWithAiFocus";
import type { MainTabParamList, MainTabScreenProps } from "../navigation/types";
import { useRoute, type RouteProp } from "@react-navigation/native";
import type { InboxLeadRow } from "../types/models";
import { useAppStore } from "../state/useAppStore";
import { useAuthStore } from "../state/useAuthStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { colors } from "../theme/colors";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

type Props = MainTabScreenProps<"Pipeline">;

type ImportPreviewState =
  | {
    kind: "csv";
    validRows: ValidImportRow[];
    skippedMissingName: number;
    totalDataRows: number;
    previewLines: string[];
  }
  | { kind: "whatsapp"; leads: WhatsAppGroupLeadRow[]; stats: WhatsAppImportStats; chatLines: string[] };

/** Kanban columns ↔ `public.leads.status` (CRM check constraint). */
export type PipelineColumnId = "new" | "contacted" | "qualified" | "closed";

const COLUMNS: { id: PipelineColumnId; label: string }[] = [
  { id: "new", label: "new" },
  { id: "contacted", label: "contacted" },
  { id: "qualified", label: "qualified" },
  { id: "closed", label: "closed" },
];

/** Stage options in the card “change status” action sheet (order matches pipeline). */
const STAGE_ACTION_SHEET_OPTIONS: { id: PipelineColumnId; label: string }[] = [
  { id: "new", label: "→ New" },
  { id: "contacted", label: "→ Contacted" },
  { id: "qualified", label: "→ Qualified" },
  { id: "closed", label: "→ Closed" },
];

const CHAT_STAGE_FILTER_OPTIONS: { label: string; value: ChatSearchFilters["stage"] }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Qualified", value: "qualified" },
  { label: "Closed", value: "closed" },
];

const CHAT_SENDER_OPTIONS: { label: string; value: ChatSearchFilters["sender"] }[] = [
  { label: "All", value: "all" },
  { label: "From lead", value: "lead" },
  { label: "My messages", value: "user" },
];

const SORT_OPTIONS: { value: PipelineSortId; label: string }[] = [
  { value: "score", label: "Score ↓" },
  { value: "deal_value", label: "Deal Value ↓" },
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
  { value: "priority", label: "Priority" },
];

const MIN_SCORE_OPTIONS: { value: "all" | "40" | "60" | "80"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "40", label: "40+" },
  { value: "60", label: "60+" },
  { value: "80", label: "80+" },
];

/** Includes scoring + deal columns when migrations are applied. */
const LEADS_SELECT_FULL =
  "id,name,phone,email,source,source_channel,status,priority,notes,city,created_at,next_follow_up_at,lead_score,score_reasons,deal_value,deal_currency";

/** Older DBs without `lead_score` / `deal_value` columns. */
const LEADS_SELECT_FALLBACK =
  "id,name,phone,email,source,source_channel,status,priority,notes,city,created_at,next_follow_up_at";

function isMissingColumnOrSchemaError(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("column") ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    m.includes("undefined column")
  );
}

async function persistLeadScoresToSupabase(
  supabase: ReturnType<typeof getSupabaseClient>,
  leads: InboxLeadRow[],
): Promise<void> {
  const chunk = 30;
  for (let i = 0; i < leads.length; i += chunk) {
    const slice = leads.slice(i, i + chunk);
    await Promise.all(
      slice.map((lead) => {
        const score = coerceLeadScoreNumber(lead.lead_score) ?? 0;
        const reasons = Array.isArray(lead.score_reasons) ? lead.score_reasons : [];
        return supabase.from("leads").update({ lead_score: score, score_reasons: reasons }).eq("id", lead.id);
      }),
    );
  }
}

const COLUMN_WIDTH = Math.min(280, Math.max(220, Dimensions.get("window").width * 0.78));

/** Matches CSS `calc(100vh - 280px)` using live window height; floor keeps tiny viewports usable. */
function pipelineColumnMaxHeight(windowHeight: number): number {
  return Math.max(120, windowHeight - 280);
}

const PIPELINE_SCROLLBAR_STYLE_ID = "pipeline-kanban-column-scrollbar";

function ensurePipelineColumnScrollbarStyles(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById(PIPELINE_SCROLLBAR_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = PIPELINE_SCROLLBAR_STYLE_ID;
  el.textContent = `
    .pipeline-column-v-scroll {
      overflow-y: auto !important;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.15) transparent;
    }
    .pipeline-column-v-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .pipeline-column-v-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .pipeline-column-v-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.15);
      border-radius: 3px;
    }
    .pipeline-column-v-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.3);
    }
  `;
  document.head.appendChild(el);
}

/** Map DB status → column. `closed` column holds terminal outcomes. */
export function statusToColumn(status: string | null | undefined): PipelineColumnId {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "new";
  if (s === "contacted") return "contacted";
  if (s === "qualified" || s === "proposal_sent") return "qualified";
  if (s === "won" || s === "lost") return "closed";
  return "new";
}

function columnToDbStatus(column: PipelineColumnId, closedOutcome: "won" | "lost"): string {
  switch (column) {
    case "new":
      return "new";
    case "contacted":
      return "contacted";
    case "qualified":
      return "qualified";
    case "closed":
      return closedOutcome;
    default:
      return "new";
  }
}

function groupByColumn(leads: InboxLeadRow[]): Record<PipelineColumnId, InboxLeadRow[]> {
  const out: Record<PipelineColumnId, InboxLeadRow[]> = {
    new: [],
    contacted: [],
    qualified: [],
    closed: [],
  };
  for (const lead of leads) {
    out[statusToColumn(lead.status ?? undefined)].push(lead);
  }
  return out;
}

export type PriorityFilterId = "all" | "high" | "medium" | "low";
export type StageFilterId = "all" | PipelineColumnId;

/** Normalize DB/UI priority for filter comparison (low | medium | high). */
function priorityBucket(p: string | null | undefined): "high" | "medium" | "low" | null {
  const x = (p ?? "").toLowerCase().trim();
  if (x === "high" || x === "hot") return "high";
  if (x === "medium" || x === "warm") return "medium";
  if (x === "low" || x === "cold") return "low";
  return null;
}

function matchesNameSearch(lead: InboxLeadRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = String(lead.name ?? "").toLowerCase();
  return name.includes(q);
}

function matchesPriorityFilter(lead: InboxLeadRow, filter: PriorityFilterId): boolean {
  if (filter === "all") return true;
  const b = priorityBucket(lead.priority);
  return b === filter;
}

function matchesStageFilter(lead: InboxLeadRow, filter: StageFilterId): boolean {
  if (filter === "all") return true;
  return statusToColumn(lead.status ?? undefined) === filter;
}

const PRIORITY_FILTER_OPTIONS: { value: PriorityFilterId; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STAGE_FILTER_OPTIONS: { value: StageFilterId; label: string }[] = [
  { value: "all", label: "All stages" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
];

/** Same empty UI for every pipeline column when that stage has 0 leads. */
function PipelineColumnEmptyState() {
  return (
    <View style={styles.emptyStageBox}>
      <Ionicons name="layers-outline" size={26} color={colors.textMuted} style={styles.emptyStageIcon} />
      <Text style={styles.emptyStageLabel}>No leads in this stage</Text>
    </View>
  );
}

export function PipelineScreen({ navigation }: Props) {
  const route = useRoute<RouteProp<MainTabParamList, "Pipeline">>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { height: windowHeight } = useWindowDimensions();
  const columnMaxHeight = useMemo(() => pipelineColumnMaxHeight(windowHeight), [windowHeight]);

  useLayoutEffect(() => {
    ensurePipelineColumnScrollbarStyles();
  }, []);

  const renderPipelineColumnScroll = useCallback(
    (props: ComponentProps<typeof ScrollView>) => (
      <ScrollView
        {...props}
        {...(Platform.OS === "web"
          ? ({ className: "pipeline-column-v-scroll" } as Record<string, string>)
          : {})}
      />
    ),
    [],
  );

  const leadsDataRevision = useAppStore((s) => s.leadsDataRevision);
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);
  const user = useAuthStore((s) => s.user);
  const whatsAppCountryCode = useAppPreferencesStore((s) => s.whatsAppCountryCode);
  const waOpenOpts = useMemo(
    () => ({ countryPrefix: whatsAppCountryCode.trim() ? whatsAppCountryCode : undefined }),
    [whatsAppCountryCode],
  );
  const waOpts = useMemo(
    () => ({
      ...waOpenOpts,
      feedback: { error: (m: string) => showToast(m, "error") },
    }),
    [waOpenOpts, showToast],
  );
  const [leads, setLeads] = useState<InboxLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterId>("all");
  const [stageFilter, setStageFilter] = useState<StageFilterId>("all");
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<PipelineSortId>("score");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [minScoreFilter, setMinScoreFilter] = useState<"all" | "40" | "60" | "80">("all");
  const [minScoreMenuOpen, setMinScoreMenuOpen] = useState(false);
  const [pipelineCardMenuLead, setPipelineCardMenuLead] = useState<InboxLeadRow | null>(null);
  const [closedPickLead, setClosedPickLead] = useState<InboxLeadRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [importPickingBusy, setImportPickingBusy] = useState(false);
  const [importConfirmBusy, setImportConfirmBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [voiceToLeadOpen, setVoiceToLeadOpen] = useState(false);
  const webFileInputRef = useRef<HTMLInputElement | null>(null);

  const [searchMode, setSearchMode] = useState<"leads" | "chats">("leads");
  const [chatSearchFocused, setChatSearchFocused] = useState(false);
  const [chatGrouped, setChatGrouped] = useState<GroupedChatSearch[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatFilters, setChatFilters] = useState<ChatSearchFilters>(DEFAULT_CHAT_SEARCH_FILTERS);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const columnFlatListRefs = useRef<Partial<Record<PipelineColumnId, FlatList<InboxLeadRow> | null>>>(
    {},
  );

  const loadLeads = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError(supabaseEnvError ?? "Supabase is not configured.");
      setLeads([]);
      return;
    }
    const supabase = getSupabaseClient();
    // PostgREST caps default rows (often 1000). Explicit high limit so the pipeline is not truncated.
    let usedFallbackSelect = false;
    let data: unknown[] | null = null;
    const full = await supabase
      .from("leads")
      .select(LEADS_SELECT_FULL)
      .order("created_at", { ascending: false })
      .limit(10_000);
    if (full.error) {
      if (isMissingColumnOrSchemaError(full.error.message)) {
        const fb = await supabase
          .from("leads")
          .select(LEADS_SELECT_FALLBACK)
          .order("created_at", { ascending: false })
          .limit(10_000);
        if (fb.error) throw new Error(fb.error.message);
        usedFallbackSelect = true;
        data = fb.data ?? [];
      } else {
        throw new Error(full.error.message);
      }
    } else {
      data = full.data ?? [];
    }

    const raw = filterValidInboxLeads((data ?? []) as InboxLeadRow[]);
    const enriched: InboxLeadRow[] = raw.map((row) => {
      const computed = calculateLeadScore(inboxLeadToScoreInput(row));
      const fromDb = coerceLeadScoreNumber(row.lead_score);
      const lead_score = fromDb !== null ? fromDb : computed.score;
      const sr = row.score_reasons;
      const score_reasons = Array.isArray(sr) ? sr : sr == null ? computed.reasons : [];
      return { ...row, lead_score, score_reasons };
    });
    setLeads(enriched);
    setError(null);
    if (enriched.length > 0 && !usedFallbackSelect) {
      void persistLeadScoresToSupabase(supabase, enriched).catch(() => {
        /* migration may not be applied yet */
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        await loadLeads();
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load pipeline.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadLeads, leadsDataRevision]);

  /** Ensure pipeline (kanban) view + lead search — not chat search — when opening this screen. */
  useFocusEffect(
    useCallback(() => {
      setSearchMode("leads");
    }, []),
  );

  const chatFiltersKey = useMemo(() => JSON.stringify(chatFilters), [chatFilters]);

  useEffect(() => {
    void getRecentChatSearches().then(setRecentSearches);
  }, []);

  useEffect(() => {
    if (searchMode !== "chats") {
      setChatGrouped([]);
      setChatLoading(false);
      return;
    }
    const q = searchQuery.trim();
    if (q.length < 2) {
      setChatGrouped([]);
      setChatLoading(false);
      return;
    }
    setChatLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          if (!isSupabaseConfigured()) {
            if (!cancelled) setChatLoading(false);
            return;
          }
          const supabase = getSupabaseClient();
          const rows = await searchChatHistory(supabase, q, chatFilters);
          if (cancelled) return;
          setChatGrouped(groupChatSearchResults(rows));
          await saveRecentChatSearch(q);
          const next = await getRecentChatSearches();
          if (!cancelled) setRecentSearches(next);
        } catch (e) {
          if (!cancelled) {
            showToast(e instanceof Error ? e.message : "Chat search failed", "error");
            setChatGrouped([]);
          }
        } finally {
          if (!cancelled) setChatLoading(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, searchMode, chatFiltersKey, showToast]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [loadLeads]);

  const onExportCsv = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
      return;
    }
    setExporting(true);
    try {
      const rows = await fetchAllLeadsForExport();
      const csv = buildLeadsCsv(rows);
      const filename = leadflowExportFilename();
      await downloadOrShareCsv(csv, filename);
      showToast(`Exported ${rows.length} leads to CSV`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not export leads.", "error");
    } finally {
      setExporting(false);
    }
  }, [showToast]);

  const onDownloadImportTemplate = useCallback(async () => {
    try {
      const csv = buildCsvImportTemplate();
      const filename = leadflowImportTemplateFilename();
      await downloadOrShareCsv(csv, filename);
      showToast("Template ready — fill rows and import.", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not share template.", "error");
    }
  }, [showToast]);

  const processCsvText = useCallback(
    (text: string) => {
      try {
        const trimmed = text.trim();
        if (!trimmed) {
          showToast("CSV file has no data", "error");
          return;
        }
        const { headers, dataRows } = parsePipelineImportCsv(trimmed);
        if (headers.length === 0) {
          showToast("CSV file has no data", "error");
          return;
        }
        const { valid, skippedMissingName, missingNameColumn } = validateAndNormalizeImportRows(headers, dataRows);
        if (valid.length === 0) {
          showToast(
            missingNameColumn
              ? 'No "Name" column found. Download the template or add a Name (or Full name) column.'
              : "No valid rows to import (every row is missing a name).",
            "error",
          );
          return;
        }
        const previewLines = valid.slice(0, 3).map((r) =>
          [r.name, r.phone?.trim() ? r.phone : "—", r.rawStage?.trim() || "new", r.rawDealValue?.trim() || "—"]
            .join(" · "),
        );
        setImportProgress(null);
        setImportPreview({
          kind: "csv",
          validRows: valid,
          skippedMissingName,
          totalDataRows: dataRows.length,
          previewLines,
        });
      } catch {
        showToast("Could not read CSV. Try again.", "error");
      }
    },
    [showToast],
  );

  const processWhatsAppText = useCallback(
    (text: string) => {
      try {
        const trimmed = text.trim();
        if (!trimmed) {
          showToast("File has no data", "error");
          return;
        }
        const result = parseWhatsAppGroupChatExport(trimmed);
        if (!result.ok) {
          showToast("Could not find leads in this export. Use a WhatsApp group chat .txt export.", "error");
          return;
        }
        setImportPreview({
          kind: "whatsapp",
          leads: result.leads,
          stats: result.stats,
          chatLines: result.lines,
        });
      } catch {
        showToast("Please export the chat from WhatsApp first", "error");
      }
    },
    [showToast],
  );

  const routeImportContent = useCallback(
    (text: string, fileName: string) => {
      const lower = fileName.toLowerCase();
      const ext = lower.includes(".") ? lower.split(".").pop() ?? "" : "";
      if (ext === "csv") {
        processCsvText(text);
        return;
      }
      if (ext === "txt") {
        processWhatsAppText(text);
        return;
      }
      showToast("Please select a .csv or .txt file", "error");
    },
    [processCsvText, processWhatsAppText, showToast],
  );

  const onWebImportFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      try {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const isCsv =
          /\.csv$/i.test(file.name) ||
          file.type === "text/csv" ||
          file.type === "application/csv" ||
          file.type === "text/comma-separated-values";
        const isTxt = /\.txt$/i.test(file.name) || file.type === "text/plain";
        if (!isCsv && !isTxt) {
          showToast("Please select a .csv or .txt file", "error");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const inferredName =
              file.name.trim() ||
              (isTxt || file.type === "text/plain" ? "chat.txt" : "import.csv");
            routeImportContent(String(reader.result ?? ""), inferredName);
          } catch {
            showToast("Could not read file. Try again.", "error");
          }
        };
        reader.onerror = () => showToast("Could not read file.", "error");
        reader.readAsText(file);
      } catch {
        showToast("Could not read file.", "error");
      }
    },
    [showToast, routeImportContent],
  );

  const pickNativeImport = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
      return;
    }
    if (!user?.id) {
      showToast("Sign in to import leads.", "error");
      return;
    }
    if (importPickingBusy || importConfirmBusy) return;
    setImportPickingBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        showToast("Please select a .csv or .txt file", "error");
        return;
      }
      const name = asset.name ?? "";
      if (name && !/\.(csv|txt)$/i.test(name)) {
        showToast("Please select a .csv or .txt file", "error");
        return;
      }
      const text = await FileSystem.readAsStringAsync(asset.uri);
      routeImportContent(text, name || "import.txt");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not import file.", "error");
    } finally {
      setImportPickingBusy(false);
    }
  }, [user?.id, importPickingBusy, importConfirmBusy, showToast, routeImportContent]);

  const onImportPress = useCallback(() => {
    if (!isSupabaseConfigured()) {
      showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
      return;
    }
    if (!user?.id) {
      showToast("Sign in to import leads.", "error");
      return;
    }
    if (importPickingBusy || importConfirmBusy) return;
    if (Platform.OS === "web") {
      webFileInputRef.current?.click();
    } else {
      void pickNativeImport();
    }
  }, [user?.id, importPickingBusy, importConfirmBusy, showToast, pickNativeImport]);

  const onConfirmImport = useCallback(
    async (whatsappMode?: "all" | "name_phone") => {
      if (!importPreview || !user?.id || !isSupabaseConfigured()) return;
      setImportConfirmBusy(true);
      setImportProgress(null);
      try {
        const supabase = getSupabaseClient();
        if (importPreview.kind === "csv") {
          const skippedName = importPreview.skippedMissingName;
          const result = await batchInsertImportedLeads(
            supabase,
            importPreview.validRows,
            user.id,
            PIPELINE_IMPORT_WORKSPACE_ID,
            {
              onProgress: (done, tot) => setImportProgress({ done, total: tot }),
            },
          );
          const parts: string[] = [];
          if (skippedName > 0) parts.push(`${skippedName} skipped (missing name)`);
          if (result.skippedDuplicate > 0) parts.push(`${result.skippedDuplicate} skipped (duplicate phone)`);
          const summary =
            parts.length > 0
              ? `Imported ${result.inserted} leads. ${parts.join("; ")}.`
              : `Successfully imported ${result.inserted} leads!`;
          showToast(summary, "success");
        } else {
          const toInsert =
            whatsappMode === "name_phone"
              ? importPreview.leads.filter((l) => l.phone && !isWhatsAppPhoneOnlyLead(l))
              : importPreview.leads;
          if (toInsert.length === 0) {
            showToast("No leads match this import option.", "info");
            return;
          }
          await batchInsertWhatsAppGroupLeads(supabase, toInsert, user.id, PIPELINE_IMPORT_WORKSPACE_ID, {
            chatLines: importPreview.chatLines,
          });
          showToast(`${toInsert.length} leads imported from group`, "success");
        }
        bumpLeadsDataRevision();
        setImportPreview(null);
      } catch {
        showToast("Import failed. Try again.", "error");
      } finally {
        setImportConfirmBusy(false);
        setImportProgress(null);
      }
    },
    [importPreview, user?.id, showToast, bumpLeadsDataRevision],
  );

  const closeImportPreview = useCallback(() => {
    if (importConfirmBusy) return;
    setImportPreview(null);
    setImportProgress(null);
  }, [importConfirmBusy]);

  const filteredLeads = useMemo(() => {
    const base = leads.filter(
      (l) =>
        matchesNameSearch(l, searchQuery) &&
        matchesPriorityFilter(l, priorityFilter) &&
        matchesStageFilter(l, stageFilter),
    );
    const minScoreThreshold = minScoreFilter === "all" ? null : Number(minScoreFilter);
    const list: InboxLeadRow[] =
      minScoreThreshold == null
        ? base
        : base.filter((l) => leadScoreSortKey(l) >= minScoreThreshold);
    return sortPipelineLeads(list, sortBy);
  }, [leads, searchQuery, priorityFilter, stageFilter, minScoreFilter, sortBy]);

  const grouped = useMemo(() => groupByColumn(filteredLeads), [filteredLeads]);

  /** After adding a lead, scroll its card into view in the New column. */
  useEffect(() => {
    const id = route.params?.scrollToLeadId;
    if (!id) return;
    if (loading) return;
    const idx = grouped["new"].findIndex((l) => l.id === id);
    if (idx < 0) {
      const t = setTimeout(() => {
        navigation.setParams({ scrollToLeadId: undefined });
      }, 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      columnFlatListRefs.current["new"]?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.35 });
      navigation.setParams({ scrollToLeadId: undefined });
    }, 280);
    return () => clearTimeout(t);
  }, [route.params?.scrollToLeadId, grouped, loading, navigation]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setPriorityFilter("all");
    setStageFilter("all");
    setSortBy("score");
    setMinScoreFilter("all");
    setChatFilters(DEFAULT_CHAT_SEARCH_FILTERS);
    setChatGrouped([]);
  }, []);

  const clearAllFilters = clearFilters;

  const priorityFilterLabel =
    PRIORITY_FILTER_OPTIONS.find((o) => o.value === priorityFilter)?.label ?? "All";
  const stageFilterLabel =
    STAGE_FILTER_OPTIONS.find((o) => o.value === stageFilter)?.label ?? "All stages";
  const sortFilterLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Score ↓";
  const minScoreFilterLabel =
    MIN_SCORE_OPTIONS.find((o) => o.value === minScoreFilter)?.label ?? "All";

  const initialLoading = loading && leads.length === 0;

  const hasActiveSearchOrFilter =
    searchQuery.trim().length > 0 ||
    priorityFilter !== "all" ||
    stageFilter !== "all" ||
    minScoreFilter !== "all" ||
    sortBy !== "score";

  const chatQueryTooShort =
    searchMode === "chats" && searchQuery.trim().length > 0 && searchQuery.trim().length < 2;
  const chatShowRecentChips =
    searchMode === "chats" && chatSearchFocused && searchQuery.trim().length === 0;
  const chatShowEmptyInit =
    searchMode === "chats" && !chatSearchFocused && searchQuery.trim().length === 0;
  const chatNoResults =
    searchMode === "chats" &&
    !chatLoading &&
    searchQuery.trim().length >= 2 &&
    chatGrouped.length === 0;

  const chatFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (chatFilters.sender !== "all") parts.push(`Sender: ${chatFilters.sender === "lead" ? "Lead" : "You"}`);
    if (chatFilters.stage !== "all") parts.push(`Stage: ${chatFilters.stage}`);
    if (chatFilters.hasPhoneOnly) parts.push("With phone only");
    if (chatFilters.dateFrom?.trim()) parts.push(`From ${chatFilters.dateFrom.trim()}`);
    if (chatFilters.dateTo?.trim()) parts.push(`To ${chatFilters.dateTo.trim()}`);
    return parts.length > 0 ? `Active filters: ${parts.join(" · ")}` : undefined;
  }, [chatFilters]);

  const showNoResults =
    searchMode === "leads" &&
    !loading &&
    leads.length > 0 &&
    filteredLeads.length === 0 &&
    hasActiveSearchOrFilter;

  const persistStatus = useCallback(
    async (leadId: string, newStatus: string) => {
      if (!isSupabaseConfigured()) return;
      const supabase = getSupabaseClient();
      setMovingId(leadId);
      try {
        const { error: upErr } = await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
        if (upErr) {
          console.error("[Pipeline] update failed:", upErr);
          showToast(upErr.message, "error");
          return;
        }
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
        const newStageLabel = formatLeadStageLabel(newStatus);
        showToast(`Moved to ${newStageLabel}`, "success");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not update status.", "error");
      } finally {
        setMovingId(null);
      }
    },
    [showToast],
  );

  const promptMoveToClosed = useCallback((lead: InboxLeadRow) => {
    setClosedPickLead(lead);
  }, []);

  const dismissClosedModal = useCallback(() => setClosedPickLead(null), []);

  const onClosedPickWon = useCallback(() => {
    const lead = closedPickLead;
    if (!lead) return;
    void persistStatus(lead.id, "won");
    dismissClosedModal();
  }, [closedPickLead, persistStatus, dismissClosedModal]);

  const onClosedPickLost = useCallback(() => {
    const lead = closedPickLead;
    if (!lead) return;
    void persistStatus(lead.id, "lost");
    dismissClosedModal();
  }, [closedPickLead, persistStatus, dismissClosedModal]);

  /** Tap card body → pick column (updates Supabase) or view lead. */
  const onCardPress = useCallback((lead: InboxLeadRow) => {
    setPipelineCardMenuLead(lead);
  }, []);

  const runCardMenuMove = useCallback(
    (target: PipelineColumnId) => {
      const lead = pipelineCardMenuLead;
      if (!lead) return;
      const currentCol = statusToColumn(lead.status ?? undefined);
      if (target === currentCol) {
        showToast("Lead is already in this stage", "info");
        setPipelineCardMenuLead(null);
        return;
      }
      if (target === "closed") {
        setPipelineCardMenuLead(null);
        setClosedPickLead(lead);
        return;
      }
      void persistStatus(lead.id, columnToDbStatus(target, "won"));
      setPipelineCardMenuLead(null);
    },
    [pipelineCardMenuLead, persistStatus, showToast],
  );

  const viewLeadFromCardMenu = useCallback(() => {
    const lead = pipelineCardMenuLead;
    if (!lead?.id) return;
    setPipelineCardMenuLead(null);
    navigation.navigate("LeadDetail", { leadId: lead.id });
  }, [pipelineCardMenuLead, navigation]);

  const goToLeadDetail = useCallback(
    (leadId: string) => {
      navigation.navigate("LeadDetail", { leadId });
    },
    [navigation],
  );

  const goToEditLead = useCallback(
    (leadId: string) => {
      navigation.navigate("EditLead", { leadId });
    },
    [navigation],
  );

  const onFollowUpSaved = useCallback((leadId: string, iso: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, next_follow_up_at: iso } : l)));
  }, []);

  const stageActionSheetCurrentCol = useMemo(
    () => (pipelineCardMenuLead ? statusToColumn(pipelineCardMenuLead.status) : null),
    [pipelineCardMenuLead],
  );

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom }]}
      accessibilityState={{ busy: initialLoading && searchMode === "leads" }}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.title}>Pipeline</Text>
            <Text style={styles.subtitle}>
              Quick status on cards · Tap card for more options · WhatsApp, edit, details below
            </Text>
          </View>
          <View style={styles.headerActions}>
            {Platform.OS === "web"
              ? createElement("input", {
                key: "pipeline-csv-import-input",
                ref: webFileInputRef,
                type: "file",
                accept: ".csv,.txt,text/csv,text/plain",
                style: { display: "none" },
                onChange: onWebImportFileChange,
              })
              : null}
            <Pressable
              style={({ pressed }) => [
                styles.exportBtn,
                (pressed || importPickingBusy || importConfirmBusy || initialLoading) && styles.exportBtnPressed,
                (importPickingBusy || importConfirmBusy || initialLoading) && styles.headerActionDisabled,
              ]}
              onPress={onImportPress}
              disabled={importPickingBusy || importConfirmBusy || initialLoading}
              accessibilityRole="button"
              accessibilityLabel="Import leads from CSV or WhatsApp chat export"
            >
              <Text style={styles.exportBtnText}>
                {importPickingBusy || importConfirmBusy ? "…" : "Import"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.exportBtn,
                (pressed || exporting || initialLoading) && styles.exportBtnPressed,
                (exporting || initialLoading) && styles.headerActionDisabled,
              ]}
              onPress={() => void onExportCsv()}
              disabled={exporting || initialLoading}
              accessibilityRole="button"
              accessibilityLabel="Export leads as CSV"
            >
              <Text style={styles.exportBtnText}>{exporting ? "…" : "Export"}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.refreshBtn,
                pressed && styles.refreshBtnPressed,
                (refreshing || initialLoading) && styles.headerActionDisabled,
              ]}
              onPress={() => void onRefresh()}
              disabled={refreshing || initialLoading}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
            >
              <Text style={styles.refreshBtnText}>{refreshing ? "…" : "Refresh"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {error ? <Text style={styles.bannerErr}>{error}</Text> : null}

      <View
        style={[
          styles.filterBar,
          initialLoading && searchMode === "leads" && styles.filterBarDisabled,
        ]}
      >
        <View style={styles.searchModeRow}>
          <Pressable
            style={({ pressed }) => [
              styles.searchModeBtn,
              searchMode === "leads" && styles.searchModeBtnActive,
              pressed && styles.searchModeBtnPressed,
            ]}
            onPress={() => setSearchMode("leads")}
            accessibilityRole="button"
            accessibilityState={{ selected: searchMode === "leads" }}
            accessibilityLabel="Search leads mode"
          >
            <Text
              style={[styles.searchModeBtnText, searchMode === "leads" && styles.searchModeBtnTextActive]}
              numberOfLines={1}
            >
              Search Leads
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.searchModeBtn,
              searchMode === "chats" && styles.searchModeBtnActive,
              pressed && styles.searchModeBtnPressed,
            ]}
            onPress={() => setSearchMode("chats")}
            accessibilityRole="button"
            accessibilityState={{ selected: searchMode === "chats" }}
            accessibilityLabel="Search chat history mode"
          >
            <Text
              style={[styles.searchModeBtnText, searchMode === "chats" && styles.searchModeBtnTextActive]}
              numberOfLines={1}
            >
              Search Chats
            </Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={searchMode === "chats" ? "Search messages (min 2 characters)" : "Search by name"}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            editable={searchMode === "chats" || !initialLoading}
            onFocus={() => {
              if (searchMode === "chats") setChatSearchFocused(true);
            }}
            onBlur={() => {
              if (searchMode === "chats") setChatSearchFocused(false);
            }}
            accessibilityLabel={
              searchMode === "chats" ? "Search chat messages" : "Search leads by name"
            }
          />
        </View>
        {searchMode === "leads" ? (
          <>
            <View style={styles.filterRow}>
              <Pressable
                style={({ pressed }) => [styles.filterSelect, pressed && styles.filterSelectPressed]}
                onPress={() => setPriorityMenuOpen(true)}
                disabled={initialLoading}
                accessibilityRole="button"
                accessibilityLabel={`Priority filter, ${priorityFilterLabel}`}
              >
                <Text style={styles.filterSelectLabel}>Priority</Text>
                <View style={styles.filterSelectValueRow}>
                  <Text style={styles.filterSelectValue} numberOfLines={1}>
                    {priorityFilterLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.filterSelect, pressed && styles.filterSelectPressed]}
                onPress={() => setStageMenuOpen(true)}
                disabled={initialLoading}
                accessibilityRole="button"
                accessibilityLabel={`Stage filter, ${stageFilterLabel}`}
              >
                <Text style={styles.filterSelectLabel}>Stage</Text>
                <View style={styles.filterSelectValueRow}>
                  <Text style={styles.filterSelectValue} numberOfLines={1}>
                    {stageFilterLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
            <View style={styles.filterRow}>
              <Pressable
                style={({ pressed }) => [styles.filterSelect, pressed && styles.filterSelectPressed]}
                onPress={() => setSortMenuOpen(true)}
                disabled={initialLoading}
                accessibilityRole="button"
                accessibilityLabel={`Sort by, ${sortFilterLabel}`}
              >
                <Text style={styles.filterSelectLabel}>Sort by</Text>
                <View style={styles.filterSelectValueRow}>
                  <Text style={styles.filterSelectValue} numberOfLines={1}>
                    {sortFilterLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.filterSelect, pressed && styles.filterSelectPressed]}
                onPress={() => setMinScoreMenuOpen(true)}
                disabled={initialLoading}
                accessibilityRole="button"
                accessibilityLabel={`Minimum score, ${minScoreFilterLabel}`}
              >
                <Text style={styles.filterSelectLabel}>Min score</Text>
                <View style={styles.filterSelectValueRow}>
                  <Text style={styles.filterSelectValue} numberOfLines={1}>
                    {minScoreFilterLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.chatFiltersPanel}>
            <Text style={styles.chatFilterSectionLabel}>Sender</Text>
            <View style={styles.chatChipRow}>
              {CHAT_SENDER_OPTIONS.map((opt) => {
                const active = chatFilters.sender === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      styles.chatMiniChip,
                      active && styles.chatMiniChipActive,
                      pressed && styles.chatMiniChipPressed,
                    ]}
                    onPress={() => setChatFilters((f) => ({ ...f, sender: opt.value }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chatMiniChipText, active && styles.chatMiniChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.chatFilterSectionLabel, styles.chatFilterSectionLabelSpaced]}>Lead stage</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chatStageChipScroll}
            >
              {CHAT_STAGE_FILTER_OPTIONS.map((opt) => {
                const active = chatFilters.stage === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      styles.chatMiniChip,
                      active && styles.chatMiniChipActive,
                      pressed && styles.chatMiniChipPressed,
                    ]}
                    onPress={() => setChatFilters((f) => ({ ...f, stage: opt.value }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chatMiniChipText, active && styles.chatMiniChipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={[styles.chatFilterSectionLabel, styles.chatFilterSectionLabelSpaced]}>
              Date range (optional)
            </Text>
            <View style={styles.chatDateRow}>
              <TextInput
                style={styles.chatDateInput}
                value={chatFilters.dateFrom ?? ""}
                onChangeText={(t) => setChatFilters((f) => ({ ...f, dateFrom: t.trim() ? t : null }))}
                placeholder="From YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.chatDateInput}
                value={chatFilters.dateTo ?? ""}
                onChangeText={(t) => setChatFilters((f) => ({ ...f, dateTo: t.trim() ? t : null }))}
                placeholder="To YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.chatPhoneRow}>
              <Text style={styles.chatPhoneLabel}>Only leads with a phone number</Text>
              <Switch
                value={chatFilters.hasPhoneOnly}
                onValueChange={(v) => setChatFilters((f) => ({ ...f, hasPhoneOnly: v }))}
                trackColor={{ false: colors.border, true: `${colors.primary}88` }}
                thumbColor={chatFilters.hasPhoneOnly ? colors.primary : colors.cardSoft}
              />
            </View>
          </View>
        )}
      </View>

      {initialLoading && searchMode === "leads" ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.hScrollKanban}
          contentContainerStyle={styles.hScrollContent}
        >
          {COLUMNS.map((col) => (
            <View
              key={col.id}
              style={[styles.column, { width: COLUMN_WIDTH, height: columnMaxHeight, maxHeight: columnMaxHeight }]}
            >
              <View style={styles.columnHeader}>
                <Text style={styles.columnTitle}>{col.label}</Text>
                <Text style={styles.columnCount}>—</Text>
              </View>
              <ScrollView
                nestedScrollEnabled
                style={styles.columnScroll}
                contentContainerStyle={styles.columnScrollContentFab}
                showsVerticalScrollIndicator={Platform.OS !== "web"}
                keyboardShouldPersistTaps="handled"
                {...(Platform.OS === "web"
                  ? ({ className: "pipeline-column-v-scroll" } as Record<string, string>)
                  : {})}
              >
                {[0, 1, 2].map((i) => (
                  <PipelineCardSkeleton key={`${col.id}-sk-${i}`} />
                ))}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      ) : searchMode === "chats" ? (
        <View style={styles.chatSearchShell}>
          <ChatSearchResultsPanel
            grouped={chatGrouped}
            loading={chatLoading}
            query={searchQuery}
            queryTooShort={chatQueryTooShort}
            noResults={chatNoResults}
            showRecentChips={chatShowRecentChips}
            showEmptyInitPrompt={chatShowEmptyInit}
            onPressLead={goToLeadDetail}
            recentSearches={recentSearches}
            onPickRecent={(q) => setSearchQuery(q)}
            filterSummary={chatFilterSummary}
          />
        </View>
      ) : (
        <View style={styles.kanbanShell}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.hScrollKanban}
            contentContainerStyle={styles.hScrollContent}
          >
            {COLUMNS.map((col) => (
              <View
                key={col.id}
                style={[styles.column, { width: COLUMN_WIDTH, height: columnMaxHeight, maxHeight: columnMaxHeight }]}
              >
                <View style={styles.columnHeader}>
                  <Text style={styles.columnTitle}>{col.label}</Text>
                  <Text style={styles.columnCount}>{grouped[col.id].length}</Text>
                </View>
                <FlatList
                  ref={(r) => {
                    columnFlatListRefs.current[col.id] = r;
                  }}
                  nestedScrollEnabled
                  removeClippedSubviews={false}
                  data={grouped[col.id]}
                  keyExtractor={(item, index) => `${String(item.id ?? "lead")}-${index}`}
                  style={styles.columnScroll}
                  onScrollToIndexFailed={({ index }) => {
                    setTimeout(() => {
                      columnFlatListRefs.current[col.id]?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
                    }, 120);
                  }}
                  contentContainerStyle={[
                    styles.columnScrollContentFab,
                    grouped[col.id].length === 0 && styles.columnListEmptyGrow,
                  ]}
                  showsVerticalScrollIndicator={Platform.OS !== "web"}
                  keyboardShouldPersistTaps="handled"
                  renderScrollComponent={Platform.OS === "web" ? renderPipelineColumnScroll : undefined}
                  renderItem={({ item: lead }) => {
                    const busy = movingId === lead.id;
                    const hasPhone = !!(
                      waOpenOpts.countryPrefix
                        ? normalizePhoneForWaMeWithPrefix(lead.phone, waOpenOpts.countryPrefix)
                        : digitsOnlyPhone(lead.phone)
                    );
                    const st = (lead.status ?? "").toLowerCase().trim();
                    const onContacted = st === "contacted";
                    const onQualified = st === "qualified" || st === "proposal_sent";
                    const closedColumnTestLike = col.id === "closed" && isTestLikeLeadName(lead.name);
                    const leadScore = leadScoreSortKey(lead);
                    const dealAmount = coerceDealValue(lead.deal_value);
                    return (
                      <View style={styles.cardWrap}>
                        <Card
                          style={[
                            styles.pipelineCard,
                            closedColumnTestLike && styles.pipelineCardTestLike,
                            styles.pipelineCardRelative,
                          ]}
                        >
                          {leadScore > 0 ? (
                            <View
                              style={[styles.scoreBadge, { backgroundColor: getScoreColor(leadScore) }]}
                              pointerEvents="none"
                            >
                              <Text style={styles.scoreBadgeText}>
                                {getScoreEmoji(leadScore)} {Math.round(leadScore)}
                              </Text>
                            </View>
                          ) : null}
                          <Pressable
                            onPress={() => onCardPress(lead)}
                            style={({ pressed }) => [
                              styles.cardBody,
                              leadScore > 0 && styles.cardBodyWithScoreBadge,
                              pressed && styles.cardBodyPressed,
                            ]}
                            disabled={busy}
                            accessibilityRole="button"
                            accessibilityLabel={`${leadDisplayName(lead.name)}, change status`}
                          >
                            <View style={styles.cardNameRow}>
                              <LeadAvatar name={lead.name} />
                              <Text
                                style={[
                                  styles.cardName,
                                  styles.cardNameBesideAvatar,
                                  isLeadNameMissing(lead.name) && styles.cardNameMuted,
                                ]}
                                numberOfLines={2}
                              >
                                {leadDisplayName(lead.name)}
                              </Text>
                            </View>
                            <Text style={styles.cardLine} numberOfLines={1}>
                              {lead.city?.trim() ? lead.city : "—"}
                            </Text>
                            <Text style={styles.cardPriority} numberOfLines={1}>
                              Priority: {formatLeadPriorityDisplay(lead.priority)}
                            </Text>
                            {dealAmount > 0 ? (
                              <Text
                                style={{ color: colors.success, fontSize: 13, fontWeight: "700", marginTop: 4 }}
                                numberOfLines={1}
                              >
                                PKR {dealAmount.toLocaleString("en-IN")}
                              </Text>
                            ) : null}
                            <View style={styles.spinnerSlot}>
                              <ActivityIndicator
                                size="small"
                                animating={busy}
                                style={[styles.cardSpinner, { opacity: busy ? 1 : 0 }]}
                                color={colors.primary}
                              />
                            </View>
                          </Pressable>

                          <View style={styles.quickStatusRow}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.quickStatusBtn,
                                onContacted && styles.quickStatusBtnActive,
                                (pressed || busy) && styles.actionBtnPressed,
                                busy && styles.quickStatusBtnBusy,
                              ]}
                              onPress={() => void persistStatus(lead.id, "contacted")}
                              disabled={busy || onContacted}
                              accessibilityRole="button"
                              accessibilityLabel="Move to contacted"
                              accessibilityState={{ disabled: busy || onContacted, selected: onContacted }}
                            >
                              <Text style={[styles.quickStatusBtnText, onContacted && styles.quickStatusBtnTextActive]}>
                                Contacted
                              </Text>
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [
                                styles.quickStatusBtn,
                                onQualified && styles.quickStatusBtnActive,
                                (pressed || busy) && styles.actionBtnPressed,
                                busy && styles.quickStatusBtnBusy,
                              ]}
                              onPress={() => void persistStatus(lead.id, "qualified")}
                              disabled={busy || onQualified}
                              accessibilityRole="button"
                              accessibilityLabel="Move to qualified"
                              accessibilityState={{ disabled: busy || onQualified, selected: onQualified }}
                            >
                              <Text style={[styles.quickStatusBtnText, onQualified && styles.quickStatusBtnTextActive]}>
                                Qualified
                              </Text>
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [
                                styles.quickStatusBtn,
                                (pressed || busy) && styles.actionBtnPressed,
                                busy && styles.quickStatusBtnBusy,
                              ]}
                              onPress={() => promptMoveToClosed(lead)}
                              disabled={busy}
                              accessibilityRole="button"
                              accessibilityLabel="Move to closed"
                            >
                              <Text style={styles.quickStatusBtnText}>Closed</Text>
                            </Pressable>
                          </View>

                          <View style={styles.cardActions}>
                            <View style={styles.actionsWrap}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.actionBtnHalf,
                                  !hasPhone && styles.actionBtnMuted,
                                  pressed && styles.actionBtnPressed,
                                ]}
                                onPress={() => void openWhatsAppForPhone(lead.phone, waOpts)}
                                disabled={busy}
                                accessibilityRole="button"
                                accessibilityLabel="WhatsApp"
                              >
                                <Ionicons
                                  name="logo-whatsapp"
                                  size={20}
                                  color={hasPhone ? "#25D366" : colors.textMuted}
                                />
                                <Text style={[styles.actionLabel, !hasPhone && styles.actionLabelMuted]}>WhatsApp</Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [styles.actionBtnHalf, pressed && styles.actionBtnPressed]}
                                onPress={() => goToEditLead(lead.id)}
                                disabled={busy}
                                accessibilityRole="button"
                                accessibilityLabel="Edit lead"
                              >
                                <Ionicons name="create-outline" size={20} color={colors.primary} />
                                <Text style={styles.actionLabel}>Edit</Text>
                              </Pressable>

                              <Pressable
                                style={({ pressed }) => [
                                  styles.detailsWideBtn,
                                  styles.actionsFull,
                                  pressed && styles.actionBtnPressed,
                                ]}
                                onPress={() => goToLeadDetail(lead.id)}
                                disabled={busy}
                                accessibilityRole="button"
                                accessibilityLabel="View details"
                              >
                                <Ionicons name="eye-outline" size={18} color={colors.primary} />
                                <Text style={styles.detailsWideText}>View details</Text>
                              </Pressable>

                              <View style={styles.actionsFull}>
                                <SetFollowUpButton
                                  leadId={lead.id}
                                  nextFollowUpAt={lead.next_follow_up_at}
                                  disabled={busy}
                                  compact
                                  onSaved={(iso) => onFollowUpSaved(lead.id, iso)}
                                />
                              </View>

                              <LeadCardAiReplyButton
                                disabled={busy}
                                onPress={() => openLeadDetailWithAiFocus(navigation, lead.id)}
                              />
                            </View>
                          </View>
                        </Card>
                      </View>
                    );
                  }}
                  ListEmptyComponent={<PipelineColumnEmptyState />}
                />
              </View>
            ))}
          </ScrollView>
          {showNoResults ? (
            <View style={styles.noMatchFooter}>
              <Text style={styles.noMatchFooterEmoji}>🔍</Text>
              <Text style={styles.noMatchFooterTitle}>No leads match your search</Text>
              <Text style={styles.noMatchFooterSubtitle}>
                Try a different name or clear your filters
              </Text>
              <Pressable
                onPress={clearAllFilters}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
                style={({ pressed }) => [styles.noMatchClearBtn, pressed && styles.noMatchClearBtnPressed]}
              >
                <Text style={styles.noMatchClearBtnText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
      <Modal
        visible={priorityMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPriorityMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={() => setPriorityMenuOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Priority</Text>
            {PRIORITY_FILTER_OPTIONS.map((opt) => {
              const selected = priorityFilter === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.modalOptionPressed,
                  ]}
                  onPress={() => {
                    setPriorityFilter(opt.value);
                    setPriorityMenuOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <Modal
        visible={stageMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStageMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={() => setStageMenuOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Stage</Text>
            {STAGE_FILTER_OPTIONS.map((opt) => {
              const selected = stageFilter === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.modalOptionPressed,
                  ]}
                  onPress={() => {
                    setStageFilter(opt.value);
                    setStageMenuOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={() => setSortMenuOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Sort by</Text>
            {SORT_OPTIONS.map((opt) => {
              const selected = sortBy === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.modalOptionPressed,
                  ]}
                  onPress={() => {
                    setSortBy(opt.value);
                    setSortMenuOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <Modal
        visible={minScoreMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMinScoreMenuOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={() => setMinScoreMenuOpen(false)}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Minimum score</Text>
            {MIN_SCORE_OPTIONS.map((opt) => {
              const selected = minScoreFilter === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.modalOption,
                    selected && styles.modalOptionSelected,
                    pressed && styles.modalOptionPressed,
                  ]}
                  onPress={() => {
                    setMinScoreFilter(opt.value);
                    setMinScoreMenuOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
      <Modal
        visible={pipelineCardMenuLead != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPipelineCardMenuLead(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={() => setPipelineCardMenuLead(null)}
            accessibilityLabel="Dismiss"
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalSheetHeadTitle}>
              {pipelineCardMenuLead ? leadDisplayName(pipelineCardMenuLead.name) : ""}
            </Text>
            <Text style={styles.modalLeadSubtitle}>Change status or view lead</Text>
            <Pressable
              style={({ pressed }) => [styles.modalActionRow, pressed && styles.modalOptionPressed]}
              onPress={viewLeadFromCardMenu}
              accessibilityRole="button"
            >
              <Text style={styles.modalActionRowText}>View details</Text>
            </Pressable>
            {STAGE_ACTION_SHEET_OPTIONS.map(({ id: colId, label }) => {
              const isCurrent = stageActionSheetCurrentCol === colId;
              return (
                <Pressable
                  key={colId}
                  style={({ pressed }) => [
                    styles.modalOption,
                    isCurrent && styles.modalStageSheetOptionRowCurrent,
                    pressed && styles.modalOptionPressed,
                  ]}
                  onPress={() => runCardMenuMove(colId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      isCurrent && styles.modalStageSheetOptionTextCurrent,
                      styles.modalStageSheetOptionLabel,
                    ]}
                  >
                    {label}
                  </Text>
                  {isCurrent ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.primary}
                      accessibilityLabel="Current stage"
                    />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              style={({ pressed }) => [styles.modalCancelRow, pressed && styles.modalOptionPressed]}
              onPress={() => setPipelineCardMenuLead(null)}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelRowText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={closedPickLead != null}
        transparent
        animationType="fade"
        onRequestClose={dismissClosedModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdropFill} onPress={dismissClosedModal} accessibilityLabel="Dismiss" />
          <View style={styles.modalSheet}>
            <Text style={styles.modalSheetHeadTitle}>Closed</Text>
            <Text style={styles.modalLeadSubtitle}>Mark as won or lost?</Text>
            <Pressable
              style={({ pressed }) => [styles.modalActionRow, pressed && styles.modalOptionPressed]}
              onPress={onClosedPickWon}
              accessibilityRole="button"
            >
              <Text style={styles.modalActionRowText}>Won</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalActionRow, pressed && styles.modalOptionPressed]}
              onPress={onClosedPickLost}
              accessibilityRole="button"
            >
              <Text style={styles.modalActionRowText}>Lost</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalCancelRow, pressed && styles.modalOptionPressed]}
              onPress={dismissClosedModal}
              accessibilityRole="button"
            >
              <Text style={styles.modalCancelRowText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={importPreview != null}
        transparent
        animationType="fade"
        onRequestClose={closeImportPreview}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdropFill}
            onPress={closeImportPreview}
            accessibilityLabel="Dismiss import preview"
          />
          <View style={styles.modalSheet}>
            {importPreview?.kind === "csv" ? (
              <>
                <Text style={styles.modalTitle}>Import leads from CSV</Text>
                <Text style={styles.importModalSummary}>
                  Found {importPreview.validRows.length} lead{importPreview.validRows.length === 1 ? "" : "s"} in CSV
                  {importPreview.totalDataRows > 0
                    ? ` (${importPreview.totalDataRows} data row${importPreview.totalDataRows === 1 ? "" : "s"})`
                    : ""}
                </Text>
                {importPreview.skippedMissingName > 0 ? (
                  <Text style={styles.importModalSkipped}>
                    {importPreview.skippedMissingName} row{importPreview.skippedMissingName === 1 ? "" : "s"} will be
                    skipped (missing name)
                  </Text>
                ) : null}
                <Text style={styles.importModalPreviewLabel}>Preview (first 3)</Text>
                <ScrollView
                  style={styles.importModalScroll}
                  contentContainerStyle={styles.importModalScrollContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {importPreview.previewLines.map((line, i) => (
                    <Text key={`imp-prev-${i}`} style={styles.importModalPreviewRow}>
                      {line}
                    </Text>
                  ))}
                </ScrollView>
                {importProgress ? (
                  <Text style={styles.importProgressText}>
                    Importing… {importProgress.done}/{importProgress.total || importPreview.validRows.length}
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    styles.importModalSecondaryBtn,
                    pressed && styles.modalOptionPressed,
                    importConfirmBusy && styles.headerActionDisabled,
                  ]}
                  onPress={() => void onDownloadImportTemplate()}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Download CSV template"
                >
                  <Text style={styles.importModalSecondaryBtnText}>Download template</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.importModalPrimaryBtn,
                    pressed && styles.modalOptionPressed,
                    importConfirmBusy && styles.headerActionDisabled,
                  ]}
                  onPress={() => void onConfirmImport()}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Import all leads from CSV"
                >
                  {importConfirmBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.importModalPrimaryBtnText}>Import all</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalCancelRow, pressed && styles.modalOptionPressed]}
                  onPress={closeImportPreview}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalCancelRowText}>Cancel</Text>
                </Pressable>
              </>
            ) : importPreview?.kind === "whatsapp" ? (
              <>
                <Text style={styles.modalTitle}>WhatsApp Chat Import</Text>
                <Text style={styles.importModalSummary}>
                  Found {importPreview.leads.length} potential leads from WhatsApp group
                </Text>
                <Text style={styles.importModalStatBlock}>
                  {importPreview.stats.nameAndPhone} with name + phone (best quality)
                  {"\n"}
                  {importPreview.stats.nameOnly} with name only (no phone found)
                  {"\n"}
                  {importPreview.stats.phoneOnly} with phone only (no name found)
                  {"\n"}
                  {importPreview.stats.skipped} lines skipped (system messages)
                </Text>
                <ScrollView
                  style={styles.waImportScroll}
                  contentContainerStyle={styles.waImportScrollContent}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {importPreview.leads.slice(0, 10).map((l, i) => (
                    <Text key={`wa-g-${i}`} style={styles.importModalPreviewRow}>
                      {l.name}
                    </Text>
                  ))}
                </ScrollView>
                <Pressable
                  style={({ pressed }) => [
                    styles.importModalPrimaryBtn,
                    pressed && styles.modalOptionPressed,
                    importConfirmBusy && styles.headerActionDisabled,
                  ]}
                  onPress={() => void onConfirmImport("all")}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Import all leads from group"
                >
                  {importConfirmBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.importModalPrimaryBtnText}>Import all</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.importModalSecondaryBtn,
                    pressed && styles.modalOptionPressed,
                    importConfirmBusy && styles.headerActionDisabled,
                  ]}
                  onPress={() => void onConfirmImport("name_phone")}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Import only leads with name and phone"
                >
                  {importConfirmBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.importModalSecondaryBtnText}>Import name + phone only</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.modalCancelRow, pressed && styles.modalOptionPressed]}
                  onPress={closeImportPreview}
                  disabled={importConfirmBusy}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalCancelRowText}>Cancel</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
      <VoiceToLeadFab bottomExtra={4} onPress={() => setVoiceToLeadOpen(true)} />
      <AddLeadFab bottomExtra={4} />
      <VoiceToLeadFlow visible={voiceToLeadOpen} onClose={() => setVoiceToLeadOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerTextCol: { flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, fontSize: 14 },
  exportBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  exportBtnPressed: { opacity: 0.88 },
  exportBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  headerActionDisabled: { opacity: 0.5 },
  refreshBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  refreshBtnPressed: { opacity: 0.9 },
  refreshBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  bannerErr: { color: colors.danger, paddingHorizontal: 16, marginBottom: 8, fontSize: 14 },
  filterBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  filterRow: { flexDirection: "row", gap: 10 },
  filterSelect: {
    flex: 1,
    backgroundColor: colors.cardSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: "center",
  },
  filterSelectPressed: { opacity: 0.92 },
  filterSelectLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 2 },
  filterSelectValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  filterSelectValue: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  filterBarDisabled: { opacity: 0.55 },
  searchModeRow: { flexDirection: "row", gap: 8 },
  searchModeBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
    alignItems: "center",
  },
  searchModeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}18`,
  },
  searchModeBtnPressed: { opacity: 0.88 },
  searchModeBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  searchModeBtnTextActive: { color: colors.primary },
  chatFiltersPanel: { gap: 0 },
  chatFilterSectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chatFilterSectionLabelSpaced: { marginTop: 10 },
  chatChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chatStageChipScroll: { flexDirection: "row", gap: 8, paddingVertical: 4, alignItems: "center" },
  chatMiniChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  chatMiniChipActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}14`,
  },
  chatMiniChipPressed: { opacity: 0.9 },
  chatMiniChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  chatMiniChipTextActive: { color: colors.primary, fontWeight: "700" },
  chatDateRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  chatDateInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  chatPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  chatPhoneLabel: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, paddingRight: 8 },
  chatSearchShell: { flex: 1, minHeight: 0, alignSelf: "stretch" },
  kanbanShell: {
    flex: 1,
    minHeight: 0,
  },
  noMatchFooter: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: "100%",
    alignSelf: "stretch",
  },
  noMatchFooterEmoji: { fontSize: 36 },
  noMatchFooterTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  noMatchFooterSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  noMatchClearBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  noMatchClearBtnPressed: { opacity: 0.88 },
  noMatchClearBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
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
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    maxHeight: "72%",
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
  modalSheetHeadTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  modalLeadSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalActionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalActionRowText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  modalCancelRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalCancelRowText: { color: colors.textMuted, fontSize: 16, fontWeight: "600", textAlign: "center" },
  importModalSummary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  importModalSkipped: {
    color: colors.textMuted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  importModalPreviewLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  importProgressText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  importModalStatBlock: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  importModalScroll: {
    maxHeight: 200,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
  },
  importModalScrollContent: { paddingVertical: 8, paddingHorizontal: 12 },
  importModalPreviewRow: {
    color: colors.text,
    fontSize: 15,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  importModalPrimaryBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  importModalPrimaryBtnText: { color: colors.text, fontWeight: "700", fontSize: 16 },
  importModalSecondaryBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  importModalSecondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  waImportScroll: {
    maxHeight: 280,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
  },
  waImportScrollContent: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalOptionSelected: { backgroundColor: colors.cardSoft },
  modalOptionPressed: { opacity: 0.95 },
  modalOptionText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  modalOptionTextSelected: { color: colors.primary },
  /** Stage-change sheet: current pipeline column for this lead. */
  modalStageSheetOptionRowCurrent: { backgroundColor: colors.cardSoft },
  modalStageSheetOptionTextCurrent: { color: colors.primary },
  modalStageSheetOptionLabel: { flex: 1, marginRight: 8, minWidth: 0 },
  hScrollKanban: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({
      web: { overflowX: "auto" as const, overflowY: "hidden" as const },
      default: {},
    }),
  },
  hScrollContent: { paddingHorizontal: 12, paddingBottom: 16, gap: 12, alignItems: "stretch" },
  column: {
    flexDirection: "column",
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  columnHeader: {
    flexShrink: 0,
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.cardSoft,
  },
  columnTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  columnCount: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  columnScroll: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({
      web: { overflowY: "auto" as const },
      default: {},
    }),
  },
  columnScrollContent: { padding: 10, paddingBottom: 20 },
  columnScrollContentFab: { padding: 10, paddingBottom: 96 },
  /** Let empty-state content sit vertically centered in the column. */
  columnListEmptyGrow: {
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 200,
  },
  cardWrap: { marginBottom: 10 },
  pipelineCard: {
    marginBottom: 0,
    minHeight: 260,
    flexDirection: "column",
  },
  /** Closed column: names that look like test data (e.g. xyz, my). */
  pipelineCardTestLike: {
    borderColor: colors.warning,
    borderWidth: 2,
    backgroundColor: "rgba(245, 158, 11, 0.08)",
  },
  pipelineCardRelative: {
    position: "relative",
    overflow: "visible",
  },
  scoreBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 2,
    minWidth: 45,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  cardBody: {
    paddingBottom: 4,
    flexShrink: 0,
    maxWidth: "100%",
  },
  /** Keeps title/avatar clear of the top-right score chip. */
  cardBodyWithScoreBadge: {
    paddingRight: 56,
  },
  cardBodyPressed: { opacity: 0.92 },
  cardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
  },
  cardName: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardNameBesideAvatar: { flex: 1, minWidth: 0 },
  cardNameMuted: { color: colors.textMuted, fontWeight: "600" },
  cardLine: { color: colors.textMuted, fontSize: 14, marginTop: 6 },
  cardPriority: {
    color: colors.text,
    fontSize: 13,
    marginTop: 6,
    fontWeight: "600",
    maxWidth: "100%",
  },
  cardSpinner: {},
  spinnerSlot: { height: 26, marginTop: 8, justifyContent: "center" },
  quickStatusRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  quickStatusBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  quickStatusBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.cardSoft,
  },
  quickStatusBtnBusy: { opacity: 0.7 },
  quickStatusBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    textAlign: "center",
  },
  quickStatusBtnTextActive: { color: colors.primary },
  cardActions: {
    marginTop: "auto",
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 10,
  },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "stretch",
  },
  actionsFull: {
    flexBasis: "100%",
    width: "100%",
  },
  actionBtnHalf: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexBasis: "48%",
    maxWidth: "48%",
    minHeight: 44,
  },
  actionLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  actionLabelMuted: { color: colors.textMuted },
  detailsWideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 44,
  },
  detailsWideText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  actionBtnMuted: { opacity: 0.85 },
  actionBtnPressed: { opacity: 0.88 },
  emptyStageBox: {
    marginHorizontal: 6,
    marginVertical: 6,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    gap: 10,
  },
  emptyStageIcon: { opacity: 0.55 },
  emptyStageLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
