import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { LeadAvatar } from "./LeadAvatar";
import { ShimmerBox } from "./ShimmerBox";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import { highlightMatch, type GroupedChatSearch } from "../lib/chatSearch";
import { formatSafeDateTime, isLeadNameMissing, leadDisplayName } from "../lib/safeData";
import { colors } from "../theme/colors";

type Props = {
  grouped: GroupedChatSearch[];
  loading: boolean;
  query: string;
  queryTooShort: boolean;
  noResults: boolean;
  showRecentChips: boolean;
  showEmptyInitPrompt: boolean;
  onPressLead: (leadId: string) => void;
  recentSearches: string[];
  onPickRecent: (q: string) => void;
  filterSummary?: string;
};

function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const hl = highlightMatch(text, query);
  if (!hl) {
    return <Text style={styles.snippetText}>{text}</Text>;
  }
  return (
    <Text style={styles.snippetText}>
      <Text style={styles.snippetPlain}>{hl.before}</Text>
      <Text style={styles.snippetMatch}>{hl.match}</Text>
      <Text style={styles.snippetPlain}>{hl.after}</Text>
    </Text>
  );
}

export function ChatSearchResultsPanel({
  grouped,
  loading,
  query,
  queryTooShort,
  noResults,
  showRecentChips,
  showEmptyInitPrompt,
  onPressLead,
  recentSearches,
  onPickRecent,
  filterSummary,
}: Props) {
  if (queryTooShort) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.hintTitle}>Type at least 2 characters to search</Text>
        <Text style={styles.hintSub}>Search message text from imported WhatsApp chats.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.skeletonWrap}>
        {[0, 1, 2].map((i) => (
          <Card key={`sk-${i}`} style={styles.skeletonCard}>
            <View style={styles.skeletonRow}>
              <ShimmerBox height={44} width={44} borderRadius={22} />
              <View style={styles.skeletonCol}>
                <ShimmerBox height={16} width={220} />
                <ShimmerBox height={14} width={260} style={{ marginTop: 10 }} />
                <ShimmerBox height={12} width={100} style={{ marginTop: 8 }} />
              </View>
            </View>
          </Card>
        ))}
      </View>
    );
  }

  if (showRecentChips && recentSearches.length > 0) {
    return (
      <View style={styles.recentWrap}>
        <Text style={styles.recentLabel}>Recent searches</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {recentSearches.map((q) => (
            <Pressable
              key={q}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              onPress={() => onPickRecent(q)}
              accessibilityRole="button"
              accessibilityLabel={`Search ${q}`}
            >
              <Text style={styles.chipText}>{q}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (showEmptyInitPrompt) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.hintTitle}>Search imported chats</Text>
        <Text style={styles.hintSub}>Type a keyword or tap the search bar to see recent searches.</Text>
      </View>
    );
  }

  if (noResults) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.emptyEmoji}>🔍</Text>
        <Text style={styles.emptyTitle}>No messages found for &apos;{query.trim()}&apos;</Text>
        <Text style={styles.hintSub}>Try different keywords</Text>
        {filterSummary ? <Text style={styles.filterHint}>{filterSummary}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.listScroll}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {grouped.map((g) => {
        const lead = g.lead;
        const first = g.messages[0];
        if (!first) return null;
        const previewSource =
          first.message.length > 160 ? `${first.message.slice(0, 160)}…` : first.message;
        const isLeadMsg = (first.sender_type ?? "").toLowerCase() === "lead";
        const more = g.messages.length - 1;
        const name = lead?.name ?? "—";
        const stage = lead?.status ? formatLeadStageLabel(lead.status) : "—";

        return (
          <Pressable
            key={g.leadId}
            onPress={() => onPressLead(g.leadId)}
            accessibilityRole="button"
            accessibilityLabel={`Open lead ${leadDisplayName(name)}`}
          >
            <Card style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <LeadAvatar name={name} size={40} />
                <View style={styles.resultHeaderText}>
                  <Text
                    style={[styles.resultName, isLeadNameMissing(lead?.name ?? null) && styles.nameMuted]}
                    numberOfLines={1}
                  >
                    {leadDisplayName(name)}
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stage}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.senderLine}>{isLeadMsg ? "They said:" : "You said:"}</Text>
              <HighlightedSnippet text={previewSource} query={query} />
              {more > 0 ? (
                <Text style={styles.moreLine}>+ {more} more match{more === 1 ? "" : "es"}</Text>
              ) : null}
              <Text style={styles.timeLine}>{formatSafeDateTime(first.sent_at, "—")}</Text>
            </Card>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  listScroll: { flex: 1, alignSelf: "stretch", minHeight: 200 },
  listContent: { paddingBottom: 24, gap: 12 },
  centerBlock: {
    flex: 1,
    minHeight: 220,
    paddingHorizontal: 16,
    paddingVertical: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  hintTitle: { color: colors.textMuted, fontSize: 16, fontWeight: "600", textAlign: "center" },
  hintSub: { color: colors.textMuted, fontSize: 14, marginTop: 8, textAlign: "center" },
  emptyEmoji: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
  filterHint: { color: colors.textMuted, fontSize: 12, marginTop: 10, textAlign: "center" },
  skeletonWrap: { flex: 1, gap: 12, paddingHorizontal: 4, minHeight: 200 },
  skeletonCard: { padding: 14 },
  skeletonRow: { flexDirection: "row", gap: 12 },
  skeletonCol: { flex: 1, gap: 6 },
  recentWrap: { paddingVertical: 8, paddingHorizontal: 4 },
  recentLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  chipRow: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPressed: { opacity: 0.85 },
  chipText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  resultCard: { padding: 14 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  resultHeaderText: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  resultName: { color: colors.text, fontSize: 17, fontWeight: "800", flexShrink: 1 },
  nameMuted: { color: colors.textMuted },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.cardSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  senderLine: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  snippetText: { fontSize: 15, lineHeight: 22 },
  snippetPlain: { color: colors.text },
  snippetMatch: {
    color: colors.primary,
    fontWeight: "800",
    backgroundColor: `${colors.primary}22`,
  },
  moreLine: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  timeLine: { color: colors.textMuted, fontSize: 11, marginTop: 8, alignSelf: "flex-end" },
});
