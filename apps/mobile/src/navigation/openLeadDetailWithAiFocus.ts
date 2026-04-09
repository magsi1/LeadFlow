/**
 * Opens Lead detail with the AI reply block scrolled into view — same entry as Pipeline “AI reply”.
 */
export function openLeadDetailWithAiFocus(
  navigation: {
    navigate: (name: "LeadDetail", params: { leadId: string; focusAi?: boolean }) => void;
  },
  leadId: string,
): void {
  navigation.navigate("LeadDetail", { leadId, focusAi: true });
}
