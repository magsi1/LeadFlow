import { colors } from "../theme/colors";

/**
 * Left accent for pipeline cards by CRM stage.
 * blue=new, yellow=contacted, orange=qualified, green=won, red=lost; other → neutral.
 */
export function pipelineStageLeftBorderColor(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase().trim();
  if (s === "new") return "#3b82f6";
  if (s === "contacted") return "#eab308";
  if (s === "qualified" || s === "proposal_sent") return "#f97316";
  if (s === "won") return "#22c55e";
  if (s === "lost") return "#ef4444";
  return colors.border;
}
