import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../components/Card";
import { FollowUpsSkeleton } from "../components/FollowUpsSkeleton";
import { formatLeadStageLabel } from "../lib/dataManagementDuplicates";
import { filterValidLeadDtos, isLeadNameMissing, leadDisplayName } from "../lib/safeData";
import { api } from "../services/api";
import { mockLeads } from "../services/mockData";
import { useAppStore } from "../state/useAppStore";
import type { LeadDto } from "../types/models";
import { colors } from "../theme/colors";

export function AssignmentScreen() {
  const insets = useSafeAreaInsets();
  const leads = useAppStore((s) => s.leads);
  const setLeads = useAppStore((s) => s.setLeads);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const safeLeads = useMemo(() => filterValidLeadDtos(leads ?? []), [leads]);

  const load = useCallback(async () => {
    if (api.demoMode) {
      setLeads(mockLeads ?? []);
      setError(null);
      return;
    }
    const data = await api.getLeads();
    const list = Array.isArray(data) ? data : [];
    setLeads(filterValidLeadDtos(list));
    setError(null);
  }, [setLeads]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        if (active) {
          const message = e instanceof Error ? e.message : "Could not load leads.";
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const retry = useCallback(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        await load();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load leads.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  if (loading && safeLeads.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <FollowUpsSkeleton />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Assignment</Text>
      <Text style={styles.subtitle}>Leads and ownership</Text>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={retry} accessibilityRole="button">
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}

      {safeLeads.map((lead: LeadDto) => (
        <Card key={lead.id}>
          <Text style={[styles.name, isLeadNameMissing(lead.fullName) && styles.nameMuted]}>
            {leadDisplayName(lead.fullName)}
          </Text>
          <Text style={styles.meta}>Intent: {lead.buyingIntent ?? "—"}</Text>
          <Text style={styles.meta}>Assigned to: {lead.assignedToId ?? "Unassigned"}</Text>
          <Text style={styles.meta}>
            Status: {lead.status != null ? formatLeadStageLabel(lead.status) : "—"}
          </Text>
        </Card>
      ))}

      {!error && safeLeads.length === 0 ? <Text style={styles.empty}>No leads to display.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "800" },
  subtitle: { color: colors.textMuted, marginTop: 4, marginBottom: 16, fontSize: 15 },
  name: { color: colors.text, fontWeight: "700", fontSize: 17 },
  nameMuted: { color: colors.textMuted, fontWeight: "600" },
  meta: { color: colors.textMuted, marginTop: 6, fontSize: 14 },
  empty: { color: colors.textMuted, marginTop: 24, textAlign: "center", fontSize: 15 },
  errorCard: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  retryBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  retryLabel: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
