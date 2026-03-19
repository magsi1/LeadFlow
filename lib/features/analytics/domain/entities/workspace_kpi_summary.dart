class WorkspaceKpiSummary {
  const WorkspaceKpiSummary({
    required this.totalLeads,
    required this.newToday,
    required this.newThisWeek,
    required this.openConversations,
    required this.followUpsDueToday,
    required this.overdueFollowUps,
    required this.convertedLeads,
    required this.wonLeads,
    required this.lostLeads,
    required this.conversionRate,
    this.avgFirstResponseMinutes,
    this.avgTimeToConversionHours,
  });

  final int totalLeads;
  final int newToday;
  final int newThisWeek;
  final int openConversations;
  final int followUpsDueToday;
  final int overdueFollowUps;
  final int convertedLeads;
  final int wonLeads;
  final int lostLeads;
  final double conversionRate;
  final double? avgFirstResponseMinutes;
  final double? avgTimeToConversionHours;
}
