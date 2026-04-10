import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  type LayoutChangeEvent,
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
import { Card } from "../components/Card";
import { LoadingScreen } from "../components/LoadingScreen";
import { SetFollowUpButton, type OpenFollowUpPickerOptions } from "../components/SetFollowUpButton";
import { useToast } from "../context/ToastContext";
import {
  calculateLeadScore,
  getScoreColor,
  getScoreLabel,
  inboxLeadToScoreInput,
  type ScoreReason,
} from "../lib/leadScoring";
import { coerceDealValue, formatPkrEnIn } from "../lib/dealValue";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import { crossPlatformConfirm } from "../lib/crossPlatformConfirm";
import { avatarBackgroundFromName, leadInitialsFromName } from "../lib/leadAvatar";
import { formatLeadPriorityDisplay } from "../lib/leadPriority";
import { getSourceLabel } from "../lib/sourceLabels";
import { formatSafeDateTime, isLeadNameMissing, leadDisplayName, parseLeadIdParam } from "../lib/safeData";
import {
  applyWhatsAppTemplateWithLeadName,
  TEMPLATES,
  type WhatsAppMessageTemplate,
} from "../lib/whatsappTemplates";
import { openWhatsAppForPhone, openWhatsAppWithPrefilledText } from "../lib/whatsapp";
import {
  getSupabaseClient,
  getSupabaseFunctionFetchConfig,
  isSupabaseConfigured,
  supabaseEnvError,
} from "../lib/supabaseClient";
import type { RootStackParamList } from "../navigation/types";
import {
  buildSuggestLeadMessages,
  clearCachedReply,
  dedupeLeadAiRequest,
  generateReply,
  getCachedReply,
  setCachedReply,
  tryGetOpenAIClientConfig,
  toUserFacingAiError,
  type GenerateReplyErrorCode,
} from "../services/ai";
import { fetchLeadAiGeneratedReplies, type LeadAiGeneratedReplyRow } from "../services/leadAiRepliesRepository";
import type { InboxLeadRow } from "../types/models";
import { useAppStore } from "../state/useAppStore";
import { useAuthStore } from "../state/useAuthStore";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";
import { colors } from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "LeadDetail" | "LeadDetails">;

type ActivityRow = {
  id: string;
  type: string;
  description: string;
  created_at: string;
};

type TimelineItem = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  at: string;
};

type LeadMessageRow = {
  id: string;
  sender_type: string;
  sender_name: string | null;
  message: string;
  sent_at: string;
};

type FollowUpAiSuggestion = {
  action: string;
  timing: string;
  channel: string;
  emoji: string;
  dueAtIso: string;
};

type AiLeadChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const AI_CHAT_STARTERS = [
  "What should I say to close this deal?",
  "Why is this lead cold?",
  "Draft a follow-up message",
] as const;

function staticFollowUpSuggestions(): FollowUpAiSuggestion[] {
  const todayPm = new Date();
  todayPm.setHours(15, 0, 0, 0);
  const tomorrowAm = new Date();
  tomorrowAm.setDate(tomorrowAm.getDate() + 1);
  tomorrowAm.setHours(10, 0, 0, 0);
  const inTwoDays = new Date();
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  inTwoDays.setHours(11, 0, 0, 0);
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() + 4);
  thisWeek.setHours(10, 0, 0, 0);
  return [
    {
      action: "Call to introduce yourself",
      timing: "Tomorrow 10am",
      channel: "Call",
      emoji: "📞",
      dueAtIso: tomorrowAm.toISOString(),
    },
    {
      action: "Send a quick WhatsApp check-in",
      timing: "Today 3pm",
      channel: "WhatsApp",
      emoji: "💬",
      dueAtIso: todayPm.toISOString(),
    },
    {
      action: "Follow up on your last conversation",
      timing: "In 2 days",
      channel: "WhatsApp",
      emoji: "💬",
      dueAtIso: inTwoDays.toISOString(),
    },
    {
      action: "Schedule an on-site visit",
      timing: "This week",
      channel: "Visit",
      emoji: "🏠",
      dueAtIso: thisWeek.toISOString(),
    },
  ];
}

function parseActivitySubtitle(a: ActivityRow): { title: string; subtitle?: string } {
  const t = (a.type ?? "").toLowerCase();
  if (t.includes("lead_created") || t === "lead created") {
    return { title: "Lead created", subtitle: a.description };
  }
  if (t.includes("status") || t.includes("stage")) {
    return { title: "Stage changed", subtitle: a.description };
  }
  return { title: a.description?.trim() ? a.description : "Activity", subtitle: a.type };
}

function buildTimelineItems(
  lead: InboxLeadRow,
  activities: ActivityRow[],
  aiReplies: LeadAiGeneratedReplyRow[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  if (lead.created_at?.trim()) {
    items.push({
      key: "created",
      icon: "person-add-outline",
      title: "Lead created",
      at: lead.created_at,
    });
  }

  for (const a of activities) {
    const t = (a.type ?? "").toLowerCase();
    if (t.includes("lead_created")) continue;
    const { title, subtitle } = parseActivitySubtitle(a);
    items.push({
      key: `act-${a.id}`,
      icon: "git-branch-outline",
      title,
      subtitle,
      at: a.created_at,
    });
  }

  if (lead.next_follow_up_at?.trim()) {
    const due = lead.next_follow_up_at;
    items.push({
      key: "followup",
      icon: "calendar-outline",
      title: "Follow-up scheduled",
      subtitle: `Due ${formatSafeDateTime(due, "—")}`,
      at: due,
    });
  }

  for (const r of aiReplies) {
    if (!r.created_at?.trim()) continue;
    const preview = (r.reply_body ?? "").trim().replace(/\s+/g, " ");
    items.push({
      key: `ai-${r.id}`,
      icon: "sparkles-outline",
      title: "AI reply generated",
      subtitle: preview.length > 80 ? `${preview.slice(0, 80)}…` : preview || undefined,
      at: r.created_at,
    });
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
}

function fallbackNotice(code?: GenerateReplyErrorCode): string {
  switch (code) {
    case "timeout":
      return "AI took too long — showing a safe default you can edit.";
    case "api":
      return "AI could not complete — showing a safe default you can edit.";
    case "config":
      return "OpenAI is not configured — showing a placeholder message.";
    case "empty":
      return "No text from AI — showing a safe default.";
    case "validation":
      return "Invalid prompt — showing a safe default.";
    default:
      return "AI was unavailable — showing a safe default you can edit.";
  }
}

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  return `+${cleaned}`;
}

/** Ensure DB row has a usable id before treating as InboxLeadRow. */
function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return null;
}

function LeadDetailHeroAvatar({ name }: { name: string | null | undefined }) {
  return (
    <View style={[styles.heroAvatar, { backgroundColor: avatarBackgroundFromName(name) }]}>
      <Text style={styles.heroAvatarInitials} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {leadInitialsFromName(name)}
      </Text>
    </View>
  );
}

function parseScoreReasons(raw: unknown): ScoreReason[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoreReason[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label : "";
    const points = typeof r.points === "number" && Number.isFinite(r.points) ? r.points : 0;
    const emoji = typeof r.emoji === "string" ? r.emoji : "";
    out.push({ label, points, emoji });
  }
  return out;
}

function normalizeLeadRow(data: unknown): InboxLeadRow | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const leadScoreRaw = o.lead_score;
  const leadScore =
    typeof leadScoreRaw === "number" && Number.isFinite(leadScoreRaw)
      ? leadScoreRaw
      : typeof leadScoreRaw === "string" && leadScoreRaw.trim() !== "" && Number.isFinite(Number(leadScoreRaw))
        ? Number(leadScoreRaw)
        : null;
  return {
    id,
    name: strOrNull(o.name),
    phone: strOrNull(o.phone),
    email: strOrNull(o.email),
    source: strOrNull(o.source),
    source_channel: strOrNull(o.source_channel),
    status: strOrNull(o.status),
    priority: strOrNull(o.priority),
    notes: strOrNull(o.notes),
    city: strOrNull(o.city),
    workspace_id: strOrNull(o.workspace_id),
    created_at: strOrNull(o.created_at),
    updated_at: strOrNull(o.updated_at),
    next_follow_up_at: strOrNull(o.next_follow_up_at),
    lead_score: leadScore,
    score_reasons: parseScoreReasons(o.score_reasons),
    deal_value: coerceDealValue(o.deal_value),
    deal_currency: strOrNull(o.deal_currency) ?? "PKR",
  };
}

export function LeadDetailScreen({ route, navigation }: Props) {
  const leadId = useMemo(() => parseLeadIdParam(route.params?.leadId), [route.params?.leadId]);
  const focusAi = route.params?.focusAi === true;

  const scrollRef = useRef<ScrollView>(null);
  const scrolledToAiRef = useRef(false);

  const [lead, setLead] = useState<InboxLeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [suggestedReply, setSuggestedReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [savedReplies, setSavedReplies] = useState<LeadAiGeneratedReplyRow[]>([]);
  const [savedLoadError, setSavedLoadError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [chatMessages, setChatMessages] = useState<LeadMessageRow[]>([]);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [waTemplateStep, setWaTemplateStep] = useState<"list" | "compose">("list");
  const [waComposeText, setWaComposeText] = useState("");
  const [waCustomDraft, setWaCustomDraft] = useState("");

  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);
  const [scoreExplainLoading, setScoreExplainLoading] = useState(false);
  const [scoreExplainBody, setScoreExplainBody] = useState<string | null>(null);
  const [scoreExplainErr, setScoreExplainErr] = useState<string | null>(null);

  const [followUpSuggestOpen, setFollowUpSuggestOpen] = useState(false);
  const [followUpSuggestLoading, setFollowUpSuggestLoading] = useState(false);
  const [followUpSuggestErr, setFollowUpSuggestErr] = useState<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<FollowUpAiSuggestion[]>([]);
  const followUpPickerRef = useRef<(opts?: OpenFollowUpPickerOptions) => void>(() => undefined);

  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState<AiLeadChatMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const aiChatScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const { showToast } = useToast();
  const bumpLeadsDataRevision = useAppStore((s) => s.bumpLeadsDataRevision);

  const waFeedback = useMemo(
    () => ({ error: (m: string) => showToast(m, "error") }),
    [showToast],
  );

  const openPhoneDialer = useCallback(
    async (phone: string | null | undefined) => {
      const formatted = formatPhone(phone);
      if (!formatted) {
        showToast("No phone on file for this lead.", "error");
        return;
      }
      const url = `tel:${formatted}`;
      try {
        const can = await Linking.canOpenURL(url);
        if (can) await Linking.openURL(url);
        else throw new Error("Cannot open dialer");
      } catch {
        showToast("Could not open dialer. Try copying the number instead.", "error");
      }
    },
    [showToast],
  );

  const openMailTo = useCallback(
    async (email: string | null | undefined) => {
      const em = String(email ?? "").trim();
      if (!em) {
        showToast("No email on file for this lead.", "error");
        return;
      }
      const url = `mailto:${encodeURIComponent(em)}`;
      try {
        await Linking.openURL(url);
      } catch {
        showToast("Could not open mail. No mail app available.", "error");
      }
    },
    [showToast],
  );

  const sessionToken = useAuthStore((s) => s.token);
  const whatsAppCountryCode = useAppPreferencesStore((s) => s.whatsAppCountryCode);
  const waOpenOpts = useMemo(
    () => ({ countryPrefix: whatsAppCountryCode.trim() ? whatsAppCountryCode : undefined }),
    [whatsAppCountryCode],
  );

  useEffect(() => {
    if (focusAi) scrolledToAiRef.current = false;
  }, [focusAi, leadId]);

  const onAiSectionLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (!focusAi || scrolledToAiRef.current) return;
      scrolledToAiRef.current = true;
      const y = e.nativeEvent.layout.y;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
      });
      navigation.setParams({ leadId, focusAi: false });
    },
    [focusAi, leadId, navigation],
  );
  const openAIConfigured = tryGetOpenAIClientConfig(sessionToken) !== null;

  const timelineItems = useMemo(
    () => (lead ? buildTimelineItems(lead, activities, savedReplies) : []),
    [lead, activities, savedReplies],
  );

  const loadSavedReplies = useCallback(async () => {
    if (!isSupabaseConfigured() || !leadId) return;
    try {
      setSavedLoadError(null);
      const rows = await fetchLeadAiGeneratedReplies(leadId, 15);
      setSavedReplies(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSavedLoadError(e instanceof Error ? e.message : "Could not load saved replies.");
    }
  }, [leadId]);

  /** Restore last draft for this lead from AsyncStorage (avoids repeat API on revisit). */
  useEffect(() => {
    setSuggestedReply("");
    if (!leadId) return;
    let cancelled = false;
    void (async () => {
      const cached = await getCachedReply(leadId);
      if (!cancelled && cached?.trim()) setSuggestedReply(cached);
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  useEffect(() => {
    setAiChatMessages([]);
    setAiChatInput("");
    setAiChatLoading(false);
  }, [leadId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        setLoading(true);
        setError(null);
        setActivities([]);
        setChatMessages([]);
        if (!leadId) {
          if (!cancelled) {
            setError("Missing lead identifier.");
            setLead(null);
            setLoading(false);
          }
          return;
        }
        try {
          if (!isSupabaseConfigured()) {
            setError(supabaseEnvError ?? "Supabase is not configured.");
            setLead(null);
            return;
          }
          const supabase = getSupabaseClient();
          const { data, error: qErr } = await supabase
            .from("leads")
            .select(
              "id,name,phone,email,source,source_channel,status,priority,notes,city,workspace_id,created_at,updated_at,next_follow_up_at,lead_score,score_reasons,deal_value,deal_currency",
            )
            .eq("id", leadId)
            .maybeSingle();
          if (cancelled) return;
          if (qErr) throw new Error(qErr.message);
          if (!data) {
            setError("This lead could not be found.");
            setLead(null);
            setActivities([]);
            return;
          }
          const normalized = normalizeLeadRow(data);
          if (!normalized) {
            setError("Invalid lead data received.");
            setLead(null);
            setActivities([]);
            return;
          }
          setLead(normalized);

          const { data: actData, error: actErr } = await supabase
            .from("activities")
            .select("id,type,description,created_at")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: true });
          if (!cancelled) {
            if (!actErr && Array.isArray(actData)) {
              setActivities(actData as ActivityRow[]);
            } else {
              setActivities([]);
            }
          }

          let nextChat: LeadMessageRow[] = [];
          try {
            const { data: msgData, error: msgErr } = await supabase
              .from("lead_messages")
              .select("id,sender_type,sender_name,message,sent_at")
              .eq("lead_id", leadId)
              .order("sent_at", { ascending: true });
            if (!cancelled && !msgErr && Array.isArray(msgData)) {
              nextChat = msgData as LeadMessageRow[];
            }
          } catch {
            // lead_messages table may not exist until migration is applied
          }
          if (!cancelled) setChatMessages(nextChat);

          void loadSavedReplies();
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to load lead.");
            setLead(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      void run();
      return () => {
        cancelled = true;
      };
    }, [leadId, loadSavedReplies]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => null });
  }, [navigation]);

  /** Header / browser tab title follows the loaded lead (native + web). */
  useLayoutEffect(() => {
    if (!lead?.id) return;
    const title = lead.name?.trim() ? leadDisplayName(lead.name) : "Lead";
    navigation.setOptions({ title });
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.title = title;
    }
    return () => {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.title = "Lead";
      }
    };
  }, [navigation, lead]);

  const generateAiReply = useCallback(
    async (forceRegenerate: boolean, openWhatsAppAfter = false) => {
      const current = lead;
      if (!current?.id?.trim()) return;

      const openWaWith = async (text: string) => {
        if (!text.trim()) return;
        await openWhatsAppWithPrefilledText(formatPhone(current.phone) ?? undefined, text, {
          ...waOpenOpts,
          feedback: waFeedback,
        });
      };

      if (!forceRegenerate) {
        const cached = await getCachedReply(current.id);
        if (cached?.trim()) {
          setSuggestedReply(cached);
          setAiNotice("Using cached draft — Regenerate for a fresh AI reply.");
          setAiError(null);
          if (openWhatsAppAfter) await openWaWith(cached);
          return;
        }
      }

      const config = tryGetOpenAIClientConfig(sessionToken);
      if (!config) {
        setAiError("Sign in and deploy the ai-chat-completion Edge Function with OPENAI_API_KEY (see repo docs).");
        return;
      }

      if (forceRegenerate) {
        await clearCachedReply(current.id);
      }

      setAiError(null);
      setAiNotice(null);

      const dedupeKey = current.id;
      await dedupeLeadAiRequest(dedupeKey, async () => {
        setAiLoading(true);
        try {
          const messages = buildSuggestLeadMessages({
            leadName: current.name,
            channel: getSourceLabel(current.source_channel ?? current.source),
            priority: formatLeadPriorityDisplay(current.priority),
            status: current.status ? current.status.replace(/_/g, " ") : undefined,
            notes: current.notes,
            city: current.city,
          });

          const result = await generateReply(config, {
            messages,
            completionOptions: { temperature: 0.55, maxTokens: 450 },
            persist: {
              leadId: current.id,
              workspaceId: current.workspace_id ?? null,
            },
          });

          const replyText = result.reply ?? "";
          setSuggestedReply(replyText);
          await setCachedReply(current.id, replyText);

          if (result.usedFallback) {
            setAiNotice(result.userFriendlyMessage ?? fallbackNotice(result.errorCode));
          }

          if (result.persist?.ok) {
            await loadSavedReplies();
          } else if (result.persist && !result.persist.ok) {
            if (!result.persist.skipped) {
              setAiError(
                `${result.persist.errorMessage} (Reply is shown above — run Supabase migration if the table is missing.)`,
              );
            } else if (!result.usedFallback) {
              setAiNotice(result.persist.errorMessage);
            }
          }

          if (openWhatsAppAfter && replyText.trim()) {
            await openWaWith(replyText);
          }
        } catch (e) {
          setAiError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
          setAiLoading(false);
        }
      });
    },
    [lead, loadSavedReplies, sessionToken, waOpenOpts, waFeedback],
  );

  const copyReply = useCallback(async () => {
    const text = suggestedReply.trim();
    if (!text) return;
    try {
      await Clipboard.setStringAsync(text);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      showToast("Could not copy to the clipboard.", "error");
    }
  }, [suggestedReply, showToast]);

  const sendViaWhatsApp = useCallback(async () => {
    await openWhatsAppWithPrefilledText(formatPhone(lead?.phone) ?? undefined, suggestedReply, {
      ...waOpenOpts,
      feedback: waFeedback,
    });
  }, [suggestedReply, lead?.phone, waOpenOpts, waFeedback]);

  const onFollowUpSavedDetail = useCallback(
    (iso: string) => {
      setLead((prev) => (prev ? { ...prev, next_follow_up_at: iso } : prev));
      bumpLeadsDataRevision();
    },
    [bumpLeadsDataRevision],
  );

  const onDeleteLead = useCallback(() => {
    const id = lead?.id?.trim();
    if (!id || !isSupabaseConfigured()) return;
    crossPlatformConfirm(
      "Delete this lead?",
      "This removes the lead from your pipeline. This cannot be undone.",
      () => {
        void (async () => {
          try {
            const supabase = getSupabaseClient();
            const { error: delErr } = await supabase.from("leads").delete().eq("id", id);
            if (delErr) throw new Error(delErr.message);
            showToast("Lead deleted", "success");
            bumpLeadsDataRevision();
            navigation.goBack();
          } catch (e) {
            showToast(e instanceof Error ? e.message : "Could not delete lead.", "error");
          }
        })();
      },
      "Delete",
    );
  }, [lead?.id, navigation, showToast, bumpLeadsDataRevision]);

  const leadScoring = useMemo(() => {
    if (!lead) return { score: 0, reasons: [] as ScoreReason[] };
    const computed = calculateLeadScore(inboxLeadToScoreInput(lead));
    const fromDb = Array.isArray(lead.score_reasons)
      ? (lead.score_reasons as ScoreReason[])
      : parseScoreReasons(lead.score_reasons);
    return {
      score:
        typeof lead.lead_score === "number" && Number.isFinite(lead.lead_score) ? lead.lead_score : computed.score,
      reasons: fromDb.length > 0 ? fromDb : computed.reasons,
    };
  }, [lead]);

  const lastContactDate = useMemo(() => {
    if (!chatMessages.length) return null;
    let best = "";
    for (const m of chatMessages) {
      const s = (m.sent_at ?? "").trim();
      if (!s) continue;
      if (!best || s > best) best = s;
    }
    return best || null;
  }, [chatMessages]);

  const leadDataForSuggestions = useMemo(() => {
    if (!lead) return null;
    const dealVal = coerceDealValue(lead.deal_value);
    return {
      name: leadDisplayName(lead.name),
      score: leadScoring.score,
      stage: formatLeadStageLabel(lead.status),
      priority: formatLeadPriorityDisplay(lead.priority),
      hasPhone: !!lead.phone?.trim(),
      hasDealValue: dealVal > 0,
      source: getSourceLabel(lead.source_channel ?? lead.source),
      notesPreview: lead.notes?.trim().slice(0, 200) ?? "",
      nextFollowUpAt: lead.next_follow_up_at,
    };
  }, [lead, leadScoring.score]);

  const leadContextForAiChat = useMemo(() => {
    if (!lead) return null;
    const dv = coerceDealValue(lead.deal_value);
    return {
      name: leadDisplayName(lead.name),
      score: leadScoring.score,
      stage: formatLeadStageLabel(lead.status),
      priority: formatLeadPriorityDisplay(lead.priority),
      dealValuePkr: dv,
      dealValueDisplay: dv > 0 ? formatPkrEnIn(dv) : "—",
      city: (lead.city ?? "").trim(),
      source: getSourceLabel(lead.source_channel ?? lead.source),
      notes: (lead.notes ?? "").trim(),
    };
  }, [lead, leadScoring.score]);

  const fetchFollowUpSuggestions = useCallback(async () => {
    setFollowUpSuggestLoading(true);
    setFollowUpSuggestErr(null);
    try {
      if (!isSupabaseConfigured() || !leadDataForSuggestions) {
        setFollowUpSuggestErr(supabaseEnvError ?? "Supabase is not configured.");
        setFollowUpSuggestions(staticFollowUpSuggestions());
        return;
      }
      const supabaseClient = getSupabaseClient();
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const accessToken = session?.access_token?.trim();
      if (!accessToken) {
        setFollowUpSuggestErr("Sign in to load smart suggestions.");
        setFollowUpSuggestions(staticFollowUpSuggestions());
        return;
      }
      const fnCfg = getSupabaseFunctionFetchConfig();
      if (!fnCfg) {
        setFollowUpSuggestErr(supabaseEnvError ?? "Supabase is not configured.");
        setFollowUpSuggestions(staticFollowUpSuggestions());
        return;
      }
      const response = await fetch(`${fnCfg.url}/functions/v1/ai-followup-suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: fnCfg.anonKey,
        },
        body: JSON.stringify({
          leadData: leadDataForSuggestions,
          lastContactDate,
        }),
      });
      const raw = await response.text();
      let parsed: { suggestions?: FollowUpAiSuggestion[]; error?: string };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        setFollowUpSuggestErr("Invalid response from suggestions service.");
        setFollowUpSuggestions(staticFollowUpSuggestions());
        return;
      }
      if (!response.ok) {
        setFollowUpSuggestErr(
          typeof parsed.error === "string" && parsed.error.trim()
            ? parsed.error.trim()
            : `Request failed (${response.status})`,
        );
        setFollowUpSuggestions(
          Array.isArray(parsed.suggestions) && parsed.suggestions.length
            ? parsed.suggestions
            : staticFollowUpSuggestions(),
        );
        return;
      }
      const list = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      const normalized = list.filter(
        (s) =>
          s &&
          typeof s.action === "string" &&
          typeof s.timing === "string" &&
          typeof s.channel === "string" &&
          typeof s.emoji === "string" &&
          typeof s.dueAtIso === "string" &&
          !Number.isNaN(Date.parse(s.dueAtIso)),
      );
      setFollowUpSuggestions(normalized.length ? normalized : staticFollowUpSuggestions());
    } catch (e) {
      setFollowUpSuggestErr(e instanceof Error ? e.message : "Could not load suggestions.");
      setFollowUpSuggestions(staticFollowUpSuggestions());
    } finally {
      setFollowUpSuggestLoading(false);
    }
  }, [leadDataForSuggestions, lastContactDate]);

  const closeFollowUpSuggestModal = useCallback(() => {
    setFollowUpSuggestOpen(false);
    setFollowUpSuggestLoading(false);
    setFollowUpSuggestErr(null);
  }, []);

  const onSelectFollowUpSuggestion = useCallback((s: FollowUpAiSuggestion) => {
    setFollowUpSuggestOpen(false);
    const d = new Date(s.dueAtIso);
    if (Number.isNaN(d.getTime())) {
      followUpPickerRef.current?.();
      return;
    }
    followUpPickerRef.current?.({
      initialDate: d,
      mode: "datetime",
      preserveTime: true,
      successToastMessage: `Follow-up set! We'll remind you ${s.timing}`,
    });
  }, []);

  const onFollowUpCustom = useCallback(() => {
    setFollowUpSuggestOpen(false);
    followUpPickerRef.current?.();
  }, []);

  const closeScoreExplainModal = useCallback(() => {
    setScoreExplainOpen(false);
    setScoreExplainLoading(false);
    setScoreExplainBody(null);
    setScoreExplainErr(null);
  }, []);

  const openScoreExplanation = useCallback(async () => {
    if (!lead) return;
    setScoreExplainOpen(true);
    setScoreExplainLoading(true);
    setScoreExplainBody(null);
    setScoreExplainErr(null);
    try {
      if (!isSupabaseConfigured()) {
        setScoreExplainErr(supabaseEnvError ?? "Supabase is not configured.");
        return;
      }
      const dealVal = coerceDealValue(lead.deal_value);
      const created = lead.created_at?.trim();
      let addedToday: "yes" | "no" = "no";
      if (created) {
        const d = new Date(created);
        const n = new Date();
        if (
          d.getFullYear() === n.getFullYear() &&
          d.getMonth() === n.getMonth() &&
          d.getDate() === n.getDate()
        ) {
          addedToday = "yes";
        }
      }
      const leadData = {
        name: leadDisplayName(lead.name),
        score: leadScoring.score,
        stage: formatLeadStageLabel(lead.status),
        priority: formatLeadPriorityDisplay(lead.priority),
        hasPhone: !!lead.phone?.trim(),
        hasDealValue: dealVal > 0,
        source: getSourceLabel(lead.source_channel ?? lead.source),
        addedToday,
      };
      const supabaseClient = getSupabaseClient();
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const accessToken = session?.access_token?.trim();
      if (!accessToken) {
        setScoreExplainErr("Sign in to use AI score analysis.");
        return;
      }
      const fnCfg = getSupabaseFunctionFetchConfig();
      if (!fnCfg) {
        setScoreExplainErr(supabaseEnvError ?? "Supabase is not configured.");
        return;
      }
      const response = await fetch(`${fnCfg.url}/functions/v1/ai-score-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: fnCfg.anonKey,
        },
        body: JSON.stringify({ leadData }),
      });
      const raw = await response.text();
      let parsed: { analysis?: string; error?: string };
      try {
        parsed = JSON.parse(raw) as { analysis?: string; error?: string };
      } catch {
        setScoreExplainErr("Invalid response from AI service.");
        return;
      }
      if (!response.ok) {
        setScoreExplainErr(
          typeof parsed.error === "string" && parsed.error.trim()
            ? parsed.error.trim()
            : `Request failed (${response.status})`,
        );
        return;
      }
      const analysis = typeof parsed.analysis === "string" ? parsed.analysis.trim() : "";
      if (!analysis) {
        setScoreExplainErr("The AI returned an empty analysis. Try again.");
        return;
      }
      setScoreExplainBody(analysis);
    } catch (e) {
      setScoreExplainErr(toUserFacingAiError(e));
    } finally {
      setScoreExplainLoading(false);
    }
  }, [lead, leadScoring.score]);

  const closeAiChatModal = useCallback(() => {
    setAiChatOpen(false);
  }, []);

  const sendAiChatMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || aiChatLoading) return;
      if (!leadContextForAiChat) return;

      if (!isSupabaseConfigured()) {
        showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
        return;
      }

      let accessToken: string;
      let fnCfg: NonNullable<ReturnType<typeof getSupabaseFunctionFetchConfig>>;
      try {
        const supabaseClient = getSupabaseClient();
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const tok = session?.access_token?.trim();
        if (!tok) {
          showToast("Sign in to use AI chat.", "error");
          return;
        }
        accessToken = tok;
        const cfg = getSupabaseFunctionFetchConfig();
        if (!cfg) {
          showToast(supabaseEnvError ?? "Supabase is not configured.", "error");
          return;
        }
        fnCfg = cfg;
      } catch (e) {
        showToast(toUserFacingAiError(e), "error");
        return;
      }

      const userMsg: AiLeadChatMessage = {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: "user",
        content: trimmed,
      };
      const historyForApi = [
        ...aiChatMessages.map(({ role, content }) => ({ role, content })),
        { role: "user" as const, content: trimmed },
      ];

      setAiChatMessages((prev) => [...prev, userMsg]);
      setAiChatInput("");
      setAiChatLoading(true);

      try {
        const response = await fetch(`${fnCfg.url}/functions/v1/ai-lead-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: fnCfg.anonKey,
          },
          body: JSON.stringify({
            messages: historyForApi,
            leadContext: leadContextForAiChat,
          }),
        });
        const raw = await response.text();
        let parsed: { reply?: string; error?: string };
        try {
          parsed = JSON.parse(raw) as { reply?: string; error?: string };
        } catch {
          setAiChatMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: "assistant",
              content: "Invalid response from AI. Please try again.",
            },
          ]);
          return;
        }
        if (!response.ok) {
          const err =
            typeof parsed.error === "string" && parsed.error.trim()
              ? parsed.error.trim()
              : `Request failed (${response.status})`;
          setAiChatMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: "assistant",
              content: err,
            },
          ]);
          return;
        }
        const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
        if (!reply) {
          setAiChatMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: "assistant",
              content: "The AI returned an empty reply. Try again.",
            },
          ]);
          return;
        }
        setAiChatMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            role: "assistant",
            content: reply,
          },
        ]);
      } catch (e) {
        setAiChatMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            role: "assistant",
            content: toUserFacingAiError(e),
          },
        ]);
      } finally {
        setAiChatLoading(false);
      }
    },
    [aiChatLoading, aiChatMessages, leadContextForAiChat, showToast],
  );

  useEffect(() => {
    if (!aiChatOpen) return;
    requestAnimationFrame(() => {
      aiChatScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [aiChatOpen, aiChatMessages, aiChatLoading]);

  useEffect(() => {
    if (!templatesModalOpen) {
      setWaTemplateStep("list");
      setWaComposeText("");
      setWaCustomDraft("");
    }
  }, [templatesModalOpen]);

  const openComposeFromTemplate = useCallback(
    (t: WhatsAppMessageTemplate) => {
      if (!formatPhone(lead?.phone)) {
        showToast("Add a phone number to send a WhatsApp message.", "error");
        return;
      }
      setWaComposeText(applyWhatsAppTemplateWithLeadName(t.message, lead?.name));
      setWaTemplateStep("compose");
    },
    [lead?.phone, lead?.name, showToast],
  );

  const openComposeFromCustomDraft = useCallback(() => {
    if (!formatPhone(lead?.phone)) {
      showToast("Add a phone number to send a WhatsApp message.", "error");
      return;
    }
    const trimmed = waCustomDraft.trim();
    if (!trimmed) {
      showToast("Type a message first.", "error");
      return;
    }
    setWaComposeText(trimmed);
    setWaTemplateStep("compose");
  }, [lead?.phone, waCustomDraft, showToast]);

  const sendWhatsAppCompose = useCallback(async () => {
    const msg = waComposeText.trim();
    if (!msg) {
      showToast("Message is empty.", "error");
      return;
    }
    const phone = formatPhone(lead?.phone);
    if (!phone) {
      showToast("Add a phone number to send a WhatsApp message.", "error");
      return;
    }
    await openWhatsAppWithPrefilledText(phone, msg, { ...waOpenOpts, feedback: waFeedback });
    setTemplatesModalOpen(false);
  }, [waComposeText, lead?.phone, waOpenOpts, waFeedback, showToast]);

  const cancelWhatsAppCompose = useCallback(() => {
    setWaTemplateStep("list");
  }, []);

  const closeTemplatesModal = useCallback(() => {
    setTemplatesModalOpen(false);
  }, []);

  const onTemplatesModalRequestClose = useCallback(() => {
    if (waTemplateStep === "compose") cancelWhatsAppCompose();
    else closeTemplatesModal();
  }, [waTemplateStep, cancelWhatsAppCompose, closeTemplatesModal]);

  if (loading) {
    return <LoadingScreen message="Loading lead…" />;
  }

  if (error || !lead) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to load lead</Text>
        <Text style={styles.errorBody}>{error ?? "Unknown error."}</Text>
      </View>
    );
  }

  const followUpLabel =
    lead.next_follow_up_at != null && String(lead.next_follow_up_at).trim() !== ""
      ? formatSafeDateTime(lead.next_follow_up_at, "None scheduled")
      : "None scheduled";

  const assistantLeadId = lead.id?.trim() || leadId;
  const hasDraft = suggestedReply.trim().length > 0;

  const lid = lead.id?.trim() || "";
  const formattedPhone = formatPhone(lead.phone);
  const dealValueNum = coerceDealValue(lead.deal_value);

  return (
    <>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <LeadDetailHeroAvatar name={lead.name} />
          <Text style={[styles.heroName, isLeadNameMissing(lead.name) && styles.nameMuted]} numberOfLines={2}>
            {leadDisplayName(lead.name)}
          </Text>
          {lead.city?.trim() ? <Text style={styles.heroCitySubheader}>{lead.city.trim()}</Text> : null}
        </View>

        <Card style={styles.dealValueHeroCard}>
          <Text style={styles.dealValueHeroLabel}>DEAL VALUE</Text>
          <Text style={styles.dealValueHeroAmount}>
            {dealValueNum > 0 ? formatPkrEnIn(dealValueNum) : "—"}
          </Text>
        </Card>

        <Card style={styles.scoreCard}>
          <Text style={styles.scoreTitle}>Lead Score</Text>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreBig, { color: getScoreColor(leadScoring.score) }]}>{leadScoring.score}</Text>
            <View style={styles.scoreLabelCol}>
              <Text style={styles.scoreLabel}>{getScoreLabel(leadScoring.score)}</Text>
              <Pressable
                style={({ pressed }) => [styles.scoreWhyBtn, pressed && styles.scoreWhyBtnPressed]}
                onPress={() => void openScoreExplanation()}
                accessibilityRole="button"
                accessibilityLabel="Why this score — AI explanation"
              >
                <Text style={styles.scoreWhyBtnText}>Why this score? 🤖</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.scoreSubtitle}>Score breakdown:</Text>
          {leadScoring.reasons.map((reason, i) => (
            <View key={`${reason.label}-${i}`} style={styles.scoreReasonRow}>
              <Text style={styles.scoreReasonText}>
                {reason.emoji} {reason.label}
              </Text>
              <Text style={styles.scoreReasonPoints}>
                {reason.points >= 0 ? "+" : ""}
                {reason.points}
              </Text>
            </View>
          ))}
        </Card>

        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.quickBtn,
              styles.quickWhatsApp,
              pressed && styles.quickPressed,
              !formattedPhone && styles.quickBtnDisabled,
            ]}
            onPress={() => void openWhatsAppForPhone(formattedPhone ?? undefined, { ...waOpenOpts, feedback: waFeedback })}
            disabled={!formattedPhone}
            accessibilityRole="button"
            accessibilityLabel="Open WhatsApp"
            accessibilityState={{ disabled: !formattedPhone }}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.quickWhatsAppText}>WhatsApp</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, styles.quickOutline, pressed && styles.quickPressed]}
            onPress={() => setTemplatesModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="WhatsApp message templates"
          >
            <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
            <Text style={styles.quickOutlineText}>Templates</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, styles.quickOutline, pressed && styles.quickPressed]}
            onPress={() => navigation.navigate("EditLead", { leadId: lid })}
            accessibilityRole="button"
            accessibilityLabel="Edit lead"
          >
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={styles.quickOutlineText}>Edit</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, styles.quickOutline, pressed && styles.quickPressed]}
            onPress={() => setAiChatOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open AI chat for this lead"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
            <Text style={styles.quickOutlineText}>AI Chat 🤖</Text>
          </Pressable>
          <View style={styles.quickFollowSlot}>
            <SetFollowUpButton
              leadId={lid}
              nextFollowUpAt={lead.next_follow_up_at}
              label="Set follow-up"
              onSaved={onFollowUpSavedDetail}
              interceptPress={({ openPicker }) => {
                followUpPickerRef.current = openPicker;
                setFollowUpSuggestOpen(true);
                void fetchFollowUpSuggestions();
              }}
            />
          </View>
          <Pressable
            style={({ pressed }) => [styles.quickBtn, styles.quickDelete, pressed && styles.quickPressed]}
            onPress={onDeleteLead}
            accessibilityRole="button"
            accessibilityLabel="Delete lead"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.quickDeleteText}>Delete</Text>
          </Pressable>
        </View>

        <Card style={styles.leadInfoCard}>
          <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>Phone</Text>
          <Pressable
            onPress={() => void openPhoneDialer(lead.phone)}
            disabled={!formattedPhone}
            style={({ pressed }) => [styles.fieldTapRow, !formattedPhone && styles.fieldTapRowDisabled, pressed && styles.fieldTapPressed]}
            accessibilityRole={formattedPhone ? "button" : "text"}
            accessibilityLabel="Call phone number"
          >
            <Text style={[styles.fieldValue, formattedPhone && styles.fieldValueLink]}>
              {formattedPhone ?? "—"}
            </Text>
            {formattedPhone ? <Ionicons name="call-outline" size={18} color={colors.primary} /> : null}
          </Pressable>

          <Text style={styles.fieldLabel}>Email</Text>
          <Pressable
            onPress={() => void openMailTo(lead.email)}
            disabled={!lead.email?.trim()}
            style={({ pressed }) => [styles.fieldTapRow, !lead.email?.trim() && styles.fieldTapRowDisabled, pressed && styles.fieldTapPressed]}
            accessibilityRole={lead.email?.trim() ? "button" : "text"}
            accessibilityLabel="Send email"
          >
            {lead.email?.trim() ? (
              <>
                <Text style={[styles.fieldValue, styles.fieldValueLink]}>{lead.email.trim()}</Text>
                <Ionicons name="mail-outline" size={18} color={colors.primary} />
              </>
            ) : (
              <Text style={[styles.emptyFieldMuted, styles.emptyFieldMutedInRow]}>No email provided</Text>
            )}
          </Pressable>

          <Text style={styles.fieldLabel}>Priority</Text>
          <Text style={styles.fieldValueStatic}>{formatLeadPriorityDisplay(lead.priority)}</Text>

          <Text style={styles.fieldLabel}>Stage</Text>
          <Text style={styles.fieldValueStatic}>{formatLeadStageLabel(lead.status)}</Text>

          <Text style={styles.fieldLabel}>Source</Text>
          <Text style={styles.fieldValueStatic}>{getSourceLabel(lead.source_channel ?? lead.source)}</Text>

          <Text style={styles.fieldLabel}>Notes</Text>
          {lead.notes?.trim() ? (
            <Text style={styles.notesBlock}>{lead.notes.trim()}</Text>
          ) : (
            <Text style={styles.emptyFieldMuted}>No notes added</Text>
          )}

          <Text style={styles.fieldLabel}>Created</Text>
          <Text style={styles.fieldValueStatic}>{formatSafeDateTime(lead.created_at, "—")}</Text>

          <Text style={styles.fieldLabel}>Next follow-up</Text>
          <Text style={styles.fieldValueStatic}>{followUpLabel}</Text>
        </Card>

        <Card style={styles.chatHistoryCard}>
          <Text style={styles.sectionTitle}>Chat History</Text>
          <Text style={styles.chatHistoryMeta}>
            {chatMessages.length} message{chatMessages.length === 1 ? "" : "s"}
          </Text>
          {chatMessages.length === 0 ? (
            <Text style={styles.chatHistoryEmpty}>No chat history yet</Text>
          ) : (
            <View style={styles.chatBubbles}>
              {chatMessages.map((m) => {
                const isLead = (m.sender_type ?? "").toLowerCase() === "lead";
                return (
                  <View
                    key={m.id}
                    style={[styles.chatRow, isLead ? styles.chatRowLead : styles.chatRowUser]}
                    accessibilityRole="text"
                  >
                    <View style={[styles.chatBubble, isLead ? styles.chatBubbleLead : styles.chatBubbleUser]}>
                      <Text style={styles.chatBubbleText}>{m.message}</Text>
                    </View>
                    <Text style={styles.chatBubbleFooter} numberOfLines={2}>
                      {(m.sender_name ?? "").trim() || (isLead ? "Lead" : "You")} ·{" "}
                      {formatSafeDateTime(m.sent_at, "—")}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <View style={styles.aiSectionAnchor} collapsable={false} onLayout={onAiSectionLayout}>
          <Card>
            <Text style={styles.sectionTitle}>AI reply</Text>
            <Text style={styles.notesMuted}>Draft a follow-up with OpenAI. Saved to your workspace when possible.</Text>

            {openAIConfigured ? (
              <>
                <View style={styles.aiBtnRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.aiBtn,
                      styles.aiBtnGrow,
                      (pressed || aiLoading) && styles.aiBtnPressed,
                      aiLoading && styles.aiBtnDisabled,
                    ]}
                    onPress={() => void generateAiReply(false)}
                    disabled={aiLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Generate AI reply"
                    accessibilityState={{ disabled: aiLoading }}
                  >
                    {aiLoading ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <Text style={styles.aiBtnText}>Generate AI Reply</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.regenerateBtn,
                      (pressed || aiLoading) && styles.aiBtnPressed,
                      aiLoading && styles.aiBtnDisabled,
                    ]}
                    onPress={() => void generateAiReply(true)}
                    disabled={aiLoading}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate AI reply with a new API call"
                    accessibilityState={{ disabled: aiLoading }}
                  >
                    <Text style={styles.regenerateBtnText}>Regenerate</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.aiReplyWaBtn,
                    (pressed || aiLoading) && styles.aiBtnPressed,
                    aiLoading && styles.aiBtnDisabled,
                  ]}
                  onPress={() => void generateAiReply(false, true)}
                  disabled={aiLoading}
                  accessibilityRole="button"
                  accessibilityLabel="AI reply: generate and send via WhatsApp"
                  accessibilityState={{ disabled: aiLoading }}
                >
                  {aiLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.aiReplyWaBtnText}>AI reply</Text>
                  )}
                </Pressable>
                <Text style={styles.aiReplyWaHint}>Generates a draft and opens WhatsApp with the message.</Text>
              </>
            ) : (
              <Text style={styles.aiHint}>
                Sign in and ensure the Supabase function `ai-chat-completion` is deployed with OPENAI_API_KEY set as a
                secret.
              </Text>
            )}

            {hasDraft ? (
              <View style={styles.replyBox}>
                <Text style={styles.replyLabel}>Draft</Text>
                <Text style={styles.replyBody}>{suggestedReply}</Text>
                <View style={styles.replyActions}>
                  <Pressable
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.aiBtnPressed]}
                    onPress={() => void copyReply()}
                    accessibilityRole="button"
                    accessibilityLabel="Copy reply to clipboard"
                  >
                    <Text style={styles.actionBtnText}>Copy Reply</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.actionBtnWhatsApp, pressed && styles.aiBtnPressed]}
                    onPress={() => void sendViaWhatsApp()}
                    accessibilityRole="button"
                    accessibilityLabel="Send AI reply via WhatsApp"
                  >
                    <Text style={styles.actionBtnWhatsAppText}>Send AI Reply via WhatsApp</Text>
                  </Pressable>
                </View>
                {copyFeedback ? <Text style={styles.copiedHint}>Copied to clipboard</Text> : null}
                {!formattedPhone ? (
                  <Text style={styles.waHint}>Add a phone number on the lead to open chat with them directly.</Text>
                ) : null}
              </View>
            ) : null}

            {aiNotice ? <Text style={styles.aiNotice}>{aiNotice}</Text> : null}
            {aiError ? <Text style={styles.aiError}>{aiError}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.aiBtnPressed]}
              onPress={() => {
                if (assistantLeadId) navigation.navigate("LeadAssistant", { leadId: assistantLeadId });
              }}
              disabled={!assistantLeadId}
              accessibilityRole="button"
              accessibilityLabel="Open conversational AI assistant"
            >
              <Text style={styles.secondaryBtnText}>Open AI chat assistant</Text>
            </Pressable>
          </Card>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Saved AI replies</Text>
          {savedLoadError ? <Text style={styles.aiError}>{savedLoadError}</Text> : null}
          {savedReplies.length === 0 && !savedLoadError ? (
            <Text style={styles.meta}>No saved replies yet. Use Generate AI Reply to create one.</Text>
          ) : null}
          {savedReplies.map((row, idx) => (
            <View key={row.id?.trim() ? row.id : `saved-${idx}`} style={styles.savedBlock}>
              <Text style={styles.savedMeta}>
                {formatSafeDateTime(row.created_at, "—")}
                {row.model ? ` · ${row.model}` : ""}
              </Text>
              <Text style={styles.savedBody}>{row.reply_body ?? ""}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Lead Timeline</Text>
          {timelineItems.length === 0 ? (
            <Text style={styles.meta}>No timeline events yet.</Text>
          ) : (
            <View style={styles.timeline}>
              {timelineItems.map((item, index) => (
                <View key={item.key} style={styles.timelineRow}>
                  <View style={styles.timelineTrack}>
                    <View style={styles.timelineDot} />
                    {index < timelineItems.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.timelineBody}>
                    <View style={styles.timelineTitleRow}>
                      <Ionicons name={item.icon} size={18} color={colors.primary} />
                      <Text style={styles.timelineTitle}>{item.title}</Text>
                    </View>
                    {item.subtitle ? <Text style={styles.timelineSubtitle}>{item.subtitle}</Text> : null}
                    <Text style={styles.timelineMeta}>{formatSafeDateTime(item.at, "—")}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      <Modal
        visible={templatesModalOpen}
        transparent
        animationType="fade"
        onRequestClose={onTemplatesModalRequestClose}
      >
        <View style={styles.templatesModalRoot}>
          <Pressable
            style={styles.templatesModalBackdrop}
            onPress={onTemplatesModalRequestClose}
            accessibilityLabel="Dismiss templates"
          />
          <View style={styles.templatesModalSheet}>
            {waTemplateStep === "list" ? (
              <>
                <Text style={styles.templatesModalTitle}>WhatsApp templates</Text>
                <Text style={styles.templatesModalSubtitle}>
                  {leadDisplayName(lead.name)} · Preview and edit before sending
                </Text>
                <ScrollView
                  style={styles.templatesModalScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={Platform.OS !== "web"}
                >
                  {TEMPLATES.map((t) => {
                    const preview = applyWhatsAppTemplateWithLeadName(t.message, lead.name);
                    return (
                      <Card key={t.id} style={styles.templateCard}>
                        <Text style={styles.templateCardTitle}>
                          {t.emoji} {t.name}
                        </Text>
                        <Text style={styles.templatePreview} numberOfLines={2}>
                          {preview}
                        </Text>
                        <Pressable
                          style={({ pressed }) => [
                            styles.templateUseBtn,
                            !formattedPhone && styles.templateUseBtnDisabled,
                            pressed && styles.templateUseBtnPressed,
                          ]}
                          onPress={() => openComposeFromTemplate(t)}
                          disabled={!formattedPhone}
                          accessibilityRole="button"
                          accessibilityLabel={`Use template ${t.name}`}
                        >
                          <Text style={styles.templateUseBtnText}>Use Template</Text>
                        </Pressable>
                      </Card>
                    );
                  })}
                  <View style={styles.templateCustomSection}>
                    <Text style={styles.templateCustomTitle}>✏️ Custom message</Text>
                    <Text style={styles.templateCustomHint}>
                      Type any message (Urdu or English). Name is not added automatically—include it if you need it.
                    </Text>
                    <TextInput
                      style={styles.templateCustomInput}
                      value={waCustomDraft}
                      onChangeText={setWaCustomDraft}
                      placeholder="Your message…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      editable={!!formattedPhone}
                    />
                    <Pressable
                      style={({ pressed }) => [
                        styles.waSendWhatsAppBtn,
                        !formattedPhone && styles.templateUseBtnDisabled,
                        pressed && styles.templateUseBtnPressed,
                      ]}
                      onPress={openComposeFromCustomDraft}
                      disabled={!formattedPhone}
                      accessibilityRole="button"
                      accessibilityLabel="Send custom message on WhatsApp"
                    >
                      <Text style={styles.waSendWhatsAppBtnText}>Send on WhatsApp</Text>
                    </Pressable>
                  </View>
                </ScrollView>
                <Pressable
                  style={({ pressed }) => [styles.templatesModalClose, pressed && styles.templatesModalClosePressed]}
                  onPress={closeTemplatesModal}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={styles.templatesModalCloseText}>Close</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.templatesModalTitle}>Preview message</Text>
                <Text style={styles.templatesModalSubtitle}>
                  Edit the text below, then send to {leadDisplayName(lead.name)} on WhatsApp.
                </Text>
                <TextInput
                  style={styles.waComposeInput}
                  value={waComposeText}
                  onChangeText={setWaComposeText}
                  multiline
                  textAlignVertical="top"
                  placeholder="Message…"
                  placeholderTextColor={colors.textMuted}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.waSendWhatsAppBtn,
                    !formattedPhone && styles.templateUseBtnDisabled,
                    pressed && styles.templateUseBtnPressed,
                  ]}
                  onPress={() => void sendWhatsAppCompose()}
                  disabled={!formattedPhone}
                  accessibilityRole="button"
                  accessibilityLabel="Send on WhatsApp"
                >
                  <Text style={styles.waSendWhatsAppBtnText}>Send on WhatsApp</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.waComposeCancelBtn, pressed && styles.templatesModalClosePressed]}
                  onPress={cancelWhatsAppCompose}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.waComposeCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={scoreExplainOpen}
        transparent
        animationType="fade"
        onRequestClose={closeScoreExplainModal}
      >
        <View style={styles.scoreExplainModalRoot}>
          <Pressable style={styles.templatesModalBackdrop} onPress={closeScoreExplainModal} accessibilityLabel="Dismiss" />
          <View style={styles.scoreExplainSheet}>
            <Text style={styles.scoreExplainTitle}>AI Score Analysis 🤖</Text>
            {scoreExplainLoading ? (
              <View style={styles.scoreExplainLoadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.scoreExplainLoadingText}>Analyzing lead…</Text>
              </View>
            ) : scoreExplainErr ? (
              <Text style={styles.scoreExplainError}>{scoreExplainErr}</Text>
            ) : (
              <ScrollView
                style={styles.scoreExplainScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== "web"}
              >
                <Text style={styles.scoreExplainBody}>{scoreExplainBody ?? ""}</Text>
              </ScrollView>
            )}
            <Pressable
              style={({ pressed }) => [styles.scoreExplainGotIt, pressed && styles.scoreWhyBtnPressed]}
              onPress={closeScoreExplainModal}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.scoreExplainGotItText}>Got it!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={followUpSuggestOpen}
        transparent
        animationType="fade"
        onRequestClose={closeFollowUpSuggestModal}
      >
        <View style={styles.followUpSuggestModalRoot}>
          <Pressable
            style={styles.templatesModalBackdrop}
            onPress={closeFollowUpSuggestModal}
            accessibilityLabel="Dismiss smart follow-up suggestions"
          />
          <View style={styles.followUpSuggestSheet}>
            <Text style={styles.followUpSuggestTitle}>Smart follow-up</Text>
            <Text style={styles.followUpSuggestSubtitle}>
              {leadDisplayName(lead.name)} · Pick a suggestion or set manually
            </Text>
            {followUpSuggestLoading ? (
              <View style={styles.followUpSuggestLoadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.followUpSuggestLoadingText}>Generating suggestions…</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.followUpSuggestScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={Platform.OS !== "web"}
              >
                {followUpSuggestErr ? (
                  <Text style={styles.followUpSuggestErrText}>{followUpSuggestErr}</Text>
                ) : null}
                {followUpSuggestions.map((s, idx) => (
                  <Pressable
                    key={`${s.action}-${idx}`}
                    style={({ pressed }) => [styles.followUpCard, pressed && styles.followUpCardPressed]}
                    onPress={() => onSelectFollowUpSuggestion(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.emoji} ${s.action}`}
                  >
                    <Text style={styles.followUpCardTitle}>
                      {s.emoji} <Text style={styles.followUpCardTitleBold}>{s.action}</Text>
                    </Text>
                    <Text style={styles.followUpCardMeta}>
                      {s.timing} · {s.channel}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={({ pressed }) => [styles.followUpCustomBtn, pressed && styles.followUpCardPressed]}
                  onPress={onFollowUpCustom}
                  accessibilityRole="button"
                  accessibilityLabel="Custom follow-up date and time"
                >
                  <Text style={styles.followUpCustomBtnText}>Custom — pick date and time</Text>
                </Pressable>
              </ScrollView>
            )}
            <Pressable
              style={({ pressed }) => [styles.followUpSuggestClose, pressed && styles.templatesModalClosePressed]}
              onPress={closeFollowUpSuggestModal}
              accessibilityRole="button"
              accessibilityLabel="Cancel smart follow-up"
            >
              <Text style={styles.followUpSuggestCloseText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={aiChatOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeAiChatModal}
      >
        <KeyboardAvoidingView
          style={styles.aiChatKeyboardRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View style={[styles.aiChatRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.aiChatHeader}>
              <Pressable
                onPress={closeAiChatModal}
                style={({ pressed }) => [styles.aiChatHeaderBack, pressed && styles.quickPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close AI chat"
              >
                <Ionicons name="chevron-back" size={26} color={colors.text} />
              </Pressable>
              <Text style={styles.aiChatHeaderTitle} numberOfLines={1}>
                AI Assistant · {leadDisplayName(lead.name)}
              </Text>
              <View style={styles.aiChatHeaderSpacer} />
            </View>

            <ScrollView
              ref={aiChatScrollRef}
              style={styles.aiChatScroll}
              contentContainerStyle={styles.aiChatScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={Platform.OS !== "web"}
            >
              <View style={styles.chatBubbles}>
                {aiChatMessages.map((m) => (
                  <View
                    key={m.id}
                    style={[styles.chatRow, m.role === "user" ? styles.chatRowUser : styles.chatRowLead]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        m.role === "user" ? styles.chatBubbleUser : styles.aiChatBubbleAssistant,
                      ]}
                    >
                      <Text style={styles.chatBubbleText}>{m.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {aiChatLoading ? (
                <View style={styles.aiChatTypingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.aiChatTypingText}>Thinking…</Text>
                </View>
              ) : null}
            </ScrollView>

            {aiChatMessages.length === 0 && !aiChatLoading ? (
              <View style={styles.aiChatStarters}>
                <Text style={styles.aiChatStartersLabel}>Try asking</Text>
                <View style={styles.aiChatChipsWrap}>
                  {AI_CHAT_STARTERS.map((s) => (
                    <Pressable
                      key={s}
                      style={({ pressed }) => [styles.aiChatChip, pressed && styles.aiChatChipPressed]}
                      onPress={() => void sendAiChatMessage(s)}
                      accessibilityRole="button"
                      accessibilityLabel={s}
                    >
                      <Text style={styles.aiChatChipText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.aiChatInputRow}>
              <TextInput
                style={styles.aiChatTextInput}
                value={aiChatInput}
                onChangeText={setAiChatInput}
                placeholder="Ask about this lead…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={4000}
                editable={!aiChatLoading}
                textAlignVertical="top"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.aiChatSendBtn,
                  (!aiChatInput.trim() || aiChatLoading) && styles.aiChatSendBtnDisabled,
                  pressed && styles.aiChatSendBtnPressed,
                ]}
                onPress={() => void sendAiChatMessage(aiChatInput)}
                disabled={!aiChatInput.trim() || aiChatLoading}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                <Ionicons name="send" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, paddingBottom: 32 },
  /** Wraps AI reply `Card` so `onLayout` y-offset is correct for `focusAi` scroll. */
  aiSectionAnchor: {},
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    padding: 24,
  },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: "700" },
  errorBody: { color: colors.textMuted, marginTop: 8, fontSize: 15, lineHeight: 22 },
  nameMuted: { color: colors.textMuted, fontWeight: "700" },
  heroSection: {
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarInitials: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 24,
    letterSpacing: 0.3,
  },
  heroName: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 14,
    alignSelf: "stretch",
    lineHeight: 32,
  },
  heroCitySubheader: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
    alignSelf: "stretch",
  },
  dealValueHeroCard: {
    marginBottom: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    alignItems: "center",
  },
  dealValueHeroLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  dealValueHeroAmount: {
    color: colors.success,
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  scoreCard: {
    marginBottom: 16,
    padding: 16,
  },
  scoreTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  scoreRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 8, flexWrap: "wrap" },
  scoreBig: { fontSize: 36, fontWeight: "800" },
  scoreLabelCol: { flex: 1, minWidth: 140, gap: 8 },
  scoreLabel: { color: colors.text, fontSize: 16, fontWeight: "600" },
  scoreWhyBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.cardSoft,
  },
  scoreWhyBtnPressed: { opacity: 0.88 },
  scoreWhyBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  scoreSubtitle: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 14, marginBottom: 6 },
  scoreReasonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  scoreReasonText: { color: colors.text, fontSize: 14, flex: 1, paddingRight: 8 },
  scoreReasonPoints: { color: colors.success, fontSize: 14, fontWeight: "700" },
  scoreExplainModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  scoreExplainSheet: {
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "88%",
    padding: 16,
    overflow: "hidden",
  },
  scoreExplainTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 12,
  },
  scoreExplainLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 14,
  },
  scoreExplainLoadingText: { color: colors.textMuted, fontSize: 14 },
  scoreExplainScroll: { maxHeight: 380 },
  scoreExplainBody: { color: colors.text, fontSize: 15, lineHeight: 24 },
  scoreExplainError: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  scoreExplainGotIt: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  scoreExplainGotItText: { color: colors.text, fontWeight: "800", fontSize: 16 },
  leadInfoCard: { marginBottom: 4 },
  chatHistoryCard: { marginBottom: 4 },
  chatHistoryMeta: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  chatHistoryEmpty: {
    color: colors.textMuted,
    fontSize: 15,
    fontStyle: "italic",
  },
  chatBubbles: { gap: 12, marginTop: 4 },
  chatRow: { maxWidth: "88%" as const },
  chatRowLead: { alignSelf: "flex-start" },
  chatRowUser: { alignSelf: "flex-end" },
  chatBubble: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    maxWidth: "100%",
  },
  chatBubbleLead: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 2,
  },
  chatBubbleUser: {
    backgroundColor: `${colors.primary}33`,
    borderTopRightRadius: 2,
  },
  chatBubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  chatBubbleFooter: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  quickBtn: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 140,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    minHeight: 48,
  },
  quickPressed: { opacity: 0.9 },
  quickBtnDisabled: { opacity: 0.45 },
  quickWhatsApp: { backgroundColor: "#25D366" },
  quickWhatsAppText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  quickOutline: {
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickOutlineText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  quickFollowSlot: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 140,
    justifyContent: "center",
  },
  quickDelete: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.45)",
  },
  quickDeleteText: { color: colors.danger, fontWeight: "800", fontSize: 14 },
  templatesModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  templatesModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.78)",
  },
  templatesModalSheet: {
    zIndex: 2,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "88%",
    padding: 16,
    overflow: "hidden",
  },
  templatesModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  templatesModalSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  templatesModalScroll: { maxHeight: 420 },
  templateCard: {
    marginBottom: 12,
    padding: 14,
  },
  templateCardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  templatePreview: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  templateUseBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  templateUseBtnDisabled: { opacity: 0.45 },
  templateUseBtnPressed: { opacity: 0.88 },
  templateUseBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  templatesModalClose: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 12,
  },
  templatesModalClosePressed: { opacity: 0.85 },
  templatesModalCloseText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  templateCustomSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginBottom: 8,
  },
  templateCustomTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  templateCustomHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  templateCustomInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 100,
    maxHeight: 200,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.cardSoft,
    marginBottom: 12,
  },
  waComposeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 160,
    maxHeight: 280,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.cardSoft,
    marginBottom: 14,
  },
  waSendWhatsAppBtn: {
    backgroundColor: "#25D366",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  waSendWhatsAppBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  waComposeCancelBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  waComposeCancelText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  fieldLabelFirst: { marginTop: 0 },
  fieldTapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 4,
  },
  fieldTapRowDisabled: { opacity: 0.75 },
  fieldTapPressed: { opacity: 0.88 },
  fieldValue: { color: colors.text, fontSize: 16, fontWeight: "600", flex: 1 },
  fieldValueLink: { color: colors.primary },
  fieldValueStatic: { color: colors.text, fontSize: 16, fontWeight: "600", lineHeight: 22 },
  notesBlock: { color: colors.text, fontSize: 15, lineHeight: 22 },
  emptyFieldMuted: {
    color: colors.textMuted,
    fontStyle: "italic",
    fontSize: 14,
  },
  emptyFieldMutedInRow: { flex: 1 },
  timelineCard: { marginTop: 4 },
  timeline: { marginTop: 4 },
  timelineRow: { flexDirection: "row", alignItems: "stretch" },
  timelineTrack: { width: 22, alignItems: "center", marginRight: 10 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    backgroundColor: colors.border,
    minHeight: 28,
  },
  timelineBody: { flex: 1, paddingBottom: 16 },
  timelineTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timelineTitle: { color: colors.text, fontSize: 15, fontWeight: "700", flex: 1 },
  timelineSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  timelineMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: "600" },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 8 },
  notesMuted: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  row: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  label: { color: colors.textMuted },
  value: { color: colors.text, fontWeight: "600" },
  notes: { color: colors.text, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  aiBtnRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
  },
  aiReplyWaBtn: {
    marginTop: 12,
    backgroundColor: "#128C7E",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  aiReplyWaBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  aiReplyWaHint: { marginTop: 6, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  aiBtnGrow: { flex: 1 },
  aiBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  regenerateBtn: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSoft,
  },
  regenerateBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  aiBtnDisabled: { opacity: 0.75 },
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: colors.cardSoft,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.primary, fontWeight: "700", fontSize: 15 },
  aiBtnPressed: { opacity: 0.9 },
  aiBtnText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  aiHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  replyBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  replyBody: { color: colors.text, fontSize: 15, lineHeight: 22 },
  replyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  actionBtnText: { color: colors.text, fontWeight: "700", fontSize: 14 },
  actionBtnWhatsApp: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#25D366",
  },
  actionBtnWhatsAppText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  copiedHint: {
    marginTop: 8,
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
  },
  waHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  aiNotice: {
    marginTop: 10,
    color: colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  aiError: {
    marginTop: 10,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  savedBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  savedMeta: { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  savedBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
  followUpSuggestModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  followUpSuggestSheet: {
    zIndex: 2,
    elevation: 4,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: "88%",
    padding: 16,
    overflow: "hidden",
  },
  followUpSuggestTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  followUpSuggestSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  followUpSuggestScroll: { maxHeight: 420 },
  followUpSuggestLoadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 14,
  },
  followUpSuggestLoadingText: { color: colors.textMuted, fontSize: 14 },
  followUpSuggestErrText: {
    color: colors.warning,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  followUpCard: {
    backgroundColor: colors.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  followUpCardPressed: { opacity: 0.92 },
  followUpCardTitle: { color: colors.text, fontSize: 15, lineHeight: 22 },
  followUpCardTitleBold: { fontWeight: "800" },
  followUpCardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  followUpCustomBtn: {
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  followUpCustomBtnText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  followUpSuggestClose: { marginTop: 8, alignItems: "center", paddingVertical: 12 },
  followUpSuggestCloseText: { color: colors.textMuted, fontWeight: "700", fontSize: 16 },
  aiChatKeyboardRoot: { flex: 1, backgroundColor: colors.bg },
  aiChatRoot: { flex: 1, backgroundColor: colors.bg },
  aiChatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  aiChatHeaderBack: { padding: 6 },
  aiChatHeaderSpacer: { width: 38 },
  aiChatHeaderTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  aiChatScroll: { flex: 1 },
  aiChatScrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
  aiChatBubbleAssistant: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 2,
  },
  aiChatTypingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  aiChatTypingText: { color: colors.textMuted, fontSize: 13 },
  aiChatStarters: { paddingHorizontal: 16, paddingBottom: 8 },
  aiChatStartersLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  aiChatChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aiChatChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: "100%",
  },
  aiChatChipPressed: { opacity: 0.9 },
  aiChatChipText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  aiChatInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  aiChatTextInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.cardSoft,
  },
  aiChatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  aiChatSendBtnDisabled: { opacity: 0.45 },
  aiChatSendBtnPressed: { opacity: 0.88 },
});
