export type DashboardInsightInput = {
  followUpsDue: number;
  /** Win rate %; `null` when no closed deals — low-conversion insight is skipped. */
  conversionRate: number | null;
  totalLeads: number;
  /** Leads created today */
  leadsToday: number;
  /** Count in status `new` */
  newCount: number;
  /** Count in status `contacted` */
  contactedCount: number;
};

export type InsightVariant = "info" | "success" | "warning" | "danger";

export type DashboardInsightItem = {
  id: string;
  text: string;
  /** Ionicons name */
  icon: string;
  variant: InsightVariant;
};

/**
 * Dynamic insights for the dashboard (order: follow-ups → new today → low conversion → handling progress).
 */
export function buildDashboardInsights(input: DashboardInsightInput): DashboardInsightItem[] {
  const {
    followUpsDue,
    conversionRate,
    totalLeads,
    leadsToday,
    newCount,
    contactedCount,
  } = input;
  const items: DashboardInsightItem[] = [];

  if (followUpsDue > 0) {
    const noun = followUpsDue === 1 ? "follow-up" : "follow-ups";
    items.push({
      id: "followups-today",
      text: `You have ${followUpsDue} ${noun} due today`,
      icon: "alarm-outline",
      variant: "warning",
    });
  }

  if (leadsToday > 0) {
    const noun = leadsToday === 1 ? "new lead" : "new leads";
    items.push({
      id: "new-today",
      text: `You got ${leadsToday} ${noun} today`,
      icon: "sparkles-outline",
      variant: "success",
    });
  }

  if (conversionRate !== null && totalLeads > 0 && conversionRate < 5) {
    items.push({
      id: "conversion-low",
      text: "Conversion is low — improve follow-ups",
      icon: "trending-down-outline",
      variant: "danger",
    });
  }

  if (contactedCount > newCount) {
    items.push({
      id: "handling-progress",
      text: "Good progress — leads are being handled",
      icon: "checkmark-done-outline",
      variant: "info",
    });
  }

  return items;
}
