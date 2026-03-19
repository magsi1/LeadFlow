import 'follow_up_discipline_metric.dart';
import 'funnel_stage_metric.dart';
import 'source_metric.dart';
import 'team_performance_metric.dart';
import 'trend_point.dart';
import 'workspace_kpi_summary.dart';

class AnalyticsSnapshot {
  const AnalyticsSnapshot({
    required this.kpis,
    required this.funnel,
    required this.sources,
    required this.trends,
    required this.teamPerformance,
    required this.followUpDiscipline,
  });

  final WorkspaceKpiSummary kpis;
  final List<FunnelStageMetric> funnel;
  final List<SourceMetric> sources;
  final List<TrendPoint> trends;
  final List<TeamPerformanceMetric> teamPerformance;
  final FollowUpDisciplineMetric followUpDiscipline;
}
