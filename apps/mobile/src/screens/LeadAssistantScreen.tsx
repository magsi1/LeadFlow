import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseLeadIdParam } from "../lib/safeData";
import {
  completeLeadAssistantTurn,
  toUserFacingAiError,
  tryGetOpenAIClientConfig,
  type ChatMessage,
  type LeadReplyContext,
} from "../services/ai";
import {
  fetchLeadSummaryForAssistant,
  fetchThreadMessages,
  getOrCreateThread,
  insertThreadMessage,
  updateThreadLanguage,
} from "../services/leadAssistantRepository";
import { useAuthStore } from "../state/useAuthStore";
import type { AssistantLanguage, LeadAiMessageRow, LeadAiThreadRow } from "../types/leadAssistant";
import type { RootStackScreenProps } from "../navigation/types";
import { colors } from "../theme/colors";
import { saveLead } from "../utils/saveLead";

type Props = RootStackScreenProps<"LeadAssistant">;

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function messageUsesRtl(text: string, language: AssistantLanguage): boolean {
  if (language === "ur") return true;
  if (language === "en") return false;
  return ARABIC_SCRIPT.test(text);
}

function toChatHistory(rows: LeadAiMessageRow[]): ChatMessage[] {
  return rows
    .filter((r) => r && (r.role === "user" || r.role === "assistant"))
    .map((r) => ({ role: r.role, content: r.content ?? "" }));
}

export function LeadAssistantScreen({ route }: Props) {
  const leadId = useMemo(() => parseLeadIdParam(route.params?.leadId), [route.params?.leadId]);
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const sessionToken = useAuthStore((s) => s.token);
  const listRef = useRef<FlatList<LeadAiMessageRow>>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [thread, setThread] = useState<LeadAiThreadRow | null>(null);
  const [messages, setMessages] = useState<LeadAiMessageRow[]>([]);
  const [leadContext, setLeadContext] = useState<LeadReplyContext | null>(null);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /** Shown when Next.js lead API succeeds (never silent). */
  const [leadSaveSuccess, setLeadSaveSuccess] = useState<string | null>(null);

  const openAiReady = tryGetOpenAIClientConfig(sessionToken) !== null;

  const loadAll = useCallback(async () => {
    if (!leadId) {
      setLoadError("Missing lead identifier.");
      setReady(false);
      return;
    }
    if (!user?.id) return;
    setLoadError(null);
    const { context, workspaceId } = await fetchLeadSummaryForAssistant(leadId);
    setLeadContext(context);
    const th = await getOrCreateThread(leadId, user.id, workspaceId);
    if (!th?.id) {
      setLoadError("Could not open assistant thread.");
      setReady(false);
      return;
    }
    setThread(th);
    const msgs = await fetchThreadMessages(th.id);
    setMessages(Array.isArray(msgs) ? msgs : []);
    setReady(true);
  }, [leadId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setReady(false);
        await loadAll();
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Could not load assistant.";
          setLoadError(msg);
          setReady(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const onLanguageChange = useCallback(
    async (lang: AssistantLanguage) => {
      if (!thread?.id) return;
      try {
        await updateThreadLanguage(thread.id, lang);
        setThread((t) => (t ? { ...t, preferred_language: lang } : t));
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "Could not update language.");
      }
    },
    [thread],
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !thread?.id || !leadContext || sending) return;
    const config = tryGetOpenAIClientConfig(sessionToken);
    if (!config) {
      setSendError("Sign in and deploy the ai-chat-completion Edge Function with OPENAI_API_KEY.");
      return;
    }
    setSendError(null);
    setLeadSaveSuccess(null);
    setSending(true);
    try {
      // Verification: saveLead logs full URL; Next logs "API HIT"; UI shows success or error.
      const leadResult = await saveLead({
        name: "Website User",
        phone: "",
        message: text,
      });
      if (!leadResult.success) {
        setSendError(leadResult.error ?? "Could not save lead.");
        return;
      }
      setLeadSaveSuccess("Lead saved.");

      await insertThreadMessage(thread.id, "user", text);
      setInput("");
      const updated = await fetchThreadMessages(thread.id);
      const list = Array.isArray(updated) ? updated : [];
      setMessages(list);
      scrollToEnd();

      const history = toChatHistory(list.slice(0, -1));
      const reply = await completeLeadAssistantTurn(config, {
        leadContext,
        language: thread.preferred_language ?? "auto",
        history,
        userMessage: text,
      });
      await insertThreadMessage(thread.id, "assistant", reply);
      const finalMsgs = await fetchThreadMessages(thread.id);
      setMessages(Array.isArray(finalMsgs) ? finalMsgs : []);
      scrollToEnd();
    } catch (e) {
      setSendError(toUserFacingAiError(e));
    } finally {
      setSending(false);
    }
  }, [input, thread, leadContext, sending, scrollToEnd, sessionToken]);

  const renderMessage = useCallback(
    ({ item }: { item: LeadAiMessageRow }) => {
      const isUser = item.role === "user";
      const body = item.content ?? "";
      const rtl = messageUsesRtl(body, thread?.preferred_language ?? "auto");
      return (
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleAssistant,
              rtl ? styles.bubbleRtl : null,
            ]}
          >
            <Text style={[styles.bubbleLabel, rtl && styles.textRtl]}>{isUser ? "You" : "Assistant"}</Text>
            <Text style={[styles.bubbleText, rtl && styles.textRtl]}>{body}</Text>
          </View>
        </View>
      );
    },
    [thread?.preferred_language],
  );

  if (!ready && !loadError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>Loading assistant…</Text>
      </View>
    );
  }

  if (loadError || !thread || !leadContext) {
    return (
      <View style={[styles.center, { padding: 24, paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Assistant unavailable</Text>
        <Text style={styles.errorBody}>
          {loadError ??
            "Run the latest Supabase migration (lead_ai_threads / lead_ai_messages) and ensure you can read this lead."}
        </Text>
        <Pressable style={styles.retry} onPress={() => void loadAll()} accessibilityRole="button">
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const lang = thread.preferred_language ?? "auto";

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {!openAiReady ? (
        <Text style={styles.banner}>
          Sign in and deploy the Supabase function `ai-chat-completion` with OPENAI_API_KEY to send messages.
        </Text>
      ) : null}

      <View style={styles.langRow}>
        <Text style={styles.langLabel}>Language</Text>
        <View style={styles.langChips}>
          {(
            [
              { key: "auto" as const, label: "Auto" },
              { key: "en" as const, label: "English" },
              { key: "ur" as const, label: "اردو" },
            ] as const
          ).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => void onLanguageChange(key)}
              style={[styles.chip, lang === key && styles.chipActive, styles.chipSpacing]}
              accessibilityRole="button"
              accessibilityState={{ selected: lang === key }}
            >
              <Text style={[styles.chipText, lang === key && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item, index) => (item.id?.trim() ? item.id : `msg-${index}`)}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          <Text style={styles.empty}>Ask for a reply draft, objection handling, or next-step ideas for this lead.</Text>
        }
      />

      {leadSaveSuccess ? <Text style={styles.sendSuccess}>{leadSaveSuccess}</Text> : null}
      {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}

      <View style={[styles.composer, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Message… (English or اردو)"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
          editable={!sending && openAiReady}
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.sendBtn, (sending || !input.trim() || !openAiReady) && styles.sendBtnDisabled]}
          onPress={() => void onSend()}
          disabled={sending || !input.trim() || !openAiReady}
          accessibilityRole="button"
        >
          {sending ? <ActivityIndicator color={colors.text} /> : <Text style={styles.sendBtnText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  hint: { marginTop: 12, color: colors.textMuted },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  errorBody: { color: colors.textMuted, marginTop: 10, textAlign: "center", lineHeight: 22 },
  retry: { marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  retryText: { color: colors.text, fontWeight: "700" },
  banner: {
    backgroundColor: colors.cardSoft,
    color: colors.warning,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    textAlign: "center",
  },
  langRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  langLabel: { color: colors.textMuted, fontSize: 12, marginBottom: 8, fontWeight: "600" },
  langChips: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSpacing: { marginEnd: 8, marginBottom: 6 },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.cardSoft },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  chipTextActive: { color: colors.primary },
  listContent: { padding: 12, paddingBottom: 8 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: 32, paddingHorizontal: 16, lineHeight: 22 },
  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUser: { backgroundColor: colors.cardSoft },
  bubbleAssistant: { backgroundColor: colors.card },
  bubbleRtl: { alignSelf: "stretch" },
  bubbleLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 22 },
  textRtl: { writingDirection: "rtl", textAlign: "right" },
  sendSuccess: { color: colors.success, paddingHorizontal: 16, paddingBottom: 4, fontSize: 13 },
  sendError: { color: colors.danger, paddingHorizontal: 16, paddingBottom: 4, fontSize: 13 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    marginEnd: 10,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 72,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: colors.text, fontWeight: "700" },
});
